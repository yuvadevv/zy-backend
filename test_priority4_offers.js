import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const content = fs.readFileSync(envPath, 'utf8');
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
import { calculateManualPrice, calculateOrderTotal, calculateOfferDiscount } from './backend/worker/src/services/pricingService.js';
import { handleCalculatePricing } from './backend/worker/src/routes/pricing.js';

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function runTests() {
  console.log("=== RUNNING PRIORITY 4 AUTOMATED TEST SUITE ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Test Base Price dynamic calculation
  const customSettings = {
    printRates: { bw_single: 2.0, bw_double: 3.0, color_single: 6.0, color_double: 10.0 },
    bindingFees: { none: 0, spiral: 35.0 },
    defaultDeliveryFee: 40.0,
    platformFee: 0,
    platformFeeEnabled: false
  };

  const priceItem = calculateManualPrice(20, { color: false, singleSided: true, bindingType: 'none', copies: 1 }, customSettings);
  assert(priceItem.printingCost === 40, `Base price dynamic computation: 20 pages * 2.0 = ₹40 (got ₹${priceItem.printingCost})`);

  // 2. Test calculateOfferDiscount with 30% discount on printing only
  const offer = {
    discount_type: 'percentage',
    discount_value: 30,
    max_discount_amount: 50,
    eligible_services: '["all"]',
    eligible_components: '["printing"]'
  };

  const itemWithBinding = {
    serviceType: 'custom',
    printingCost: 60.0,
    bindingCost: 35.0,
    subtotal: 95.0
  };

  const offerDiscount = calculateOfferDiscount([itemWithBinding], offer);
  assert(offerDiscount === 18.0, `Offer discount strictly on printing (30% of ₹60 = ₹18, excludes ₹35 binding): got ₹${offerDiscount}`);

  // 3. Test Offer Max Cap Safeguard
  const bigItem = {
    serviceType: 'custom',
    printingCost: 300.0,
    bindingCost: 0,
    subtotal: 300.0
  };
  const cappedDiscount = calculateOfferDiscount([bigItem], offer);
  assert(cappedDiscount === 50.0, `Offer max discount cap (30% of ₹300 = ₹90, capped at ₹50): got ₹${cappedDiscount}`);

  // 4. Test Mutual Exclusivity: Coupon vs Offer
  const orderWithCoupon = calculateOrderTotal([95.0], 'delivery', customSettings, 20.0, 18.0);
  assert(orderWithCoupon.couponDiscount === 20.0 && orderWithCoupon.offerDiscount === 0, `Mutual Exclusivity: when coupon is passed, offer is excluded (grandTotal: ₹${orderWithCoupon.grandTotal})`);

  // 5. Test Integration via handleCalculatePricing
  const mockEnv = { DB: db };
  const mockContext = {};
  
  const mockReqBody = {
    items: [{
      id: 'test_item_1',
      serviceType: 'custom',
      pages: 20,
      printOptions: {
        color: false,
        singleSided: true,
        bindingType: 'spiral',
        copies: 1
      }
    }],
    deliveryMethod: 'delivery'
  };

  const mockRequest = {
    json: async () => mockReqBody
  };

  const pricingRes = await handleCalculatePricing(mockRequest, mockEnv, mockContext);
  const pricingData = await pricingRes.json();
  
  assert(pricingRes.status === 200, `handleCalculatePricing returns 200 OK`);
  assert(pricingData.data.offerDetails !== null, `handleCalculatePricing automatically applies active CAMPUSFEST30 offer`);
  assert(pricingData.data.items[0].originalPrintingCost > 0, `handleCalculatePricing returns originalPrintingCost`);
  assert(pricingData.data.items[0].discountedPrintingCost < pricingData.data.items[0].originalPrintingCost, `handleCalculatePricing discountedPrintingCost is reduced`);
  assert(pricingData.data.items[0].printingSavings > 0, `handleCalculatePricing provides printingSavings`);

  console.log(`\nTest results: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests();
