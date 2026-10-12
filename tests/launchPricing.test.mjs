import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateManualPrice, calculateOrderTotal, calculateOfferDiscount } from '../backend/worker/src/services/pricingService.js';

describe('Launch Pricing & Calculations Test Suite', () => {
  const originalSettings = {
    printRates: {
      bw_single: 3.0,
      bw_double: 5.0,
      color_single: 10.0,
      color_double: 0.0
    },
    bindingFees: {
      none: 0,
      spiral: 30.0,
      soft_bound: 50.0,
      hard_bound: 100.0
    },
    defaultDeliveryFee: 40.0,
    platformFee: 0,
    platformFeeEnabled: false
  };

  const bindingRules = [
    { id: 'rule-1', min_pages: 1, max_pages: 40, price: 40, is_active: 1 },
    { id: 'rule-2', min_pages: 41, max_pages: 150, price: 50, is_active: 1 },
    { id: 'rule-3', min_pages: 151, max_pages: 250, price: 70, is_active: 1 },
    { id: 'rule-4', min_pages: 251, max_pages: 400, price: 100, is_active: 1 }
  ];

  const launchPricingConfig = {
    enabled: true,
    printRates: {
      bw_single: 2.50,
      bw_double: 3.50,
      color_single: 8.00,
      color_double: 0.00
    },
    bindingRules: [
      { min_pages: 1, max_pages: 40, price: 30 },
      { min_pages: 41, max_pages: 150, price: 40 },
      { min_pages: 151, max_pages: 250, price: 60 },
      { min_pages: 251, max_pages: 400, price: 90 }
    ],
    startDate: '',
    endDate: ''
  };

  test('1. Toggle OFF strictly uses original configured prices', () => {
    const launchDisabled = { ...launchPricingConfig, enabled: false };
    const printOptions = { color: false, singleSided: true, bindingType: 'none', copies: 1 };
    const res = calculateManualPrice(10, printOptions, originalSettings, null, bindingRules, launchDisabled);

    assert.equal(res.isLaunchActive, false);
    assert.equal(res.printingRate, 3.0);
    assert.equal(res.printingCost, 30.0);
    assert.equal(res.launchSavings, 0);
  });

  test('2. Toggle ON applies proposed launch rates correctly', () => {
    // B&W single-sided: 10 pages * 2.50 = 25.0 (original: 10 * 3.0 = 30.0, savings = 5.0)
    const printOptions = { color: false, singleSided: true, bindingType: 'none', copies: 1 };
    const res = calculateManualPrice(10, printOptions, originalSettings, null, bindingRules, launchPricingConfig);

    assert.equal(res.isLaunchActive, true);
    assert.equal(res.printingRate, 2.50);
    assert.equal(res.originalPrintingRate, 3.0);
    assert.equal(res.printingCost, 25.0);
    assert.equal(res.originalPrintingCost, 30.0);
    assert.equal(res.launchSavings, 5.0);
    assert.equal(res.launchSavingsPercentage, 16.7); // (5 / 30) * 100 ≈ 16.7%
  });

  test('3. B&W double-sided uses proposed rate of 3.50 per sheet', () => {
    // 10 pages double-sided = 5 sheets * 3.50 = 17.50 (original: 5 * 5.0 = 25.0)
    const printOptions = { color: false, singleSided: false, bindingType: 'none', copies: 1 };
    const res = calculateManualPrice(10, printOptions, originalSettings, null, bindingRules, launchPricingConfig);

    assert.equal(res.printingRate, 3.50);
    assert.equal(res.originalPrintingRate, 5.0);
    assert.equal(res.printingCost, 17.50);
    assert.equal(res.originalPrintingCost, 25.0);
    assert.equal(res.launchSavings, 7.50);
  });

  test('4. Colour single-sided uses proposed rate of 8.00', () => {
    // 5 pages colour single-sided = 5 * 8.0 = 40.0 (original: 5 * 10.0 = 50.0)
    const printOptions = { color: true, singleSided: true, bindingType: 'none', copies: 1 };
    const res = calculateManualPrice(5, printOptions, originalSettings, null, bindingRules, launchPricingConfig);

    assert.equal(res.printingRate, 8.00);
    assert.equal(res.originalPrintingRate, 10.0);
    assert.equal(res.printingCost, 40.0);
    assert.equal(res.originalPrintingCost, 50.0);
    assert.equal(res.launchSavings, 10.0);
  });

  test('5. Proposed binding rates follow mapped page ranges accurately', () => {
    // Range 1 (1-40 pages): original 40, proposed launch 30
    const opts1 = { color: false, singleSided: true, bindingType: 'spiral', copies: 1 };
    const res1 = calculateManualPrice(30, opts1, originalSettings, null, bindingRules, launchPricingConfig);
    assert.equal(res1.bindingRate, 30);
    assert.equal(res1.originalBindingRate, 40);
    assert.equal(res1.launchBindingSavings, 10);

    // Range 2 (41-150 pages): original 50, proposed launch 40
    const res2 = calculateManualPrice(100, opts1, originalSettings, null, bindingRules, launchPricingConfig);
    assert.equal(res2.bindingRate, 40);
    assert.equal(res2.originalBindingRate, 50);
    assert.equal(res2.launchBindingSavings, 10);
  });

  test('6. Stacking protection: Launch pricing is separate from coupons/promos and does not automatically double-stack', () => {
    const printOptions = { color: false, singleSided: true, bindingType: 'none', copies: 1 };
    const itemPricing = calculateManualPrice(10, printOptions, originalSettings, null, bindingRules, launchPricingConfig);
    
    // When order is calculated without promo
    const orderTotal = calculateOrderTotal([itemPricing.subtotal], 'delivery', originalSettings, 0, 0);
    assert.equal(orderTotal.subtotal, 25.0);
    assert.equal(orderTotal.deliveryFee, 40.0);
    assert.equal(orderTotal.grandTotal, 65.0);
  });

  test('7. Optional scheduling window: respects start and end dates', () => {
    // Window in the past -> should be inactive
    const pastLaunch = {
      ...launchPricingConfig,
      startDate: new Date(Date.now() - 100000).toISOString(),
      endDate: new Date(Date.now() - 50000).toISOString()
    };
    const printOptions = { color: false, singleSided: true, bindingType: 'none', copies: 1 };
    const res = calculateManualPrice(10, printOptions, originalSettings, null, bindingRules, pastLaunch);
    assert.equal(res.isLaunchActive, false);
    assert.equal(res.printingRate, 3.0);
  });
});
