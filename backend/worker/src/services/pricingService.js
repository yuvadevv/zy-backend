export const DEFAULT_PRICING_SETTINGS = {
  printRates: {
    bw_single: 1.0,
    bw_double: 1.5,
    color_single: 5.0,
    color_double: 8.0
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

export function calculateManualPrice(pages, printOptions, pricingSettings = null, priceOverride = null) {
  const settings = pricingSettings || DEFAULT_PRICING_SETTINGS;
  
  const isColor = printOptions.color;
  const isSingleSided = printOptions.singleSided;
  const bindingType = printOptions.bindingType; // 'none', 'spiral'
  const copies = printOptions.copies || 1;

  let printRate = 0;
  if (!isColor) {
    printRate = isSingleSided ? settings.printRates.bw_single : settings.printRates.bw_double;
  } else {
    printRate = isSingleSided ? settings.printRates.color_single : settings.printRates.color_double;
  }
  
  // For double sided, we divide pages by 2 (ceiling).
  const sheets = isSingleSided ? pages : Math.ceil(pages / 2);
  const printingCostPerUnit = sheets * printRate;
  
  let bindingCostPerUnit = settings.bindingFees.none;
  if (bindingType === 'spiral') {
    bindingCostPerUnit = settings.bindingFees.spiral;
  } else if (bindingType === 'softbound') {
    bindingCostPerUnit = settings.bindingFees.soft_bound;
  } else if (bindingType === 'hardbound') {
    bindingCostPerUnit = settings.bindingFees.hard_bound;
  }
  
  let unitPrice = printingCostPerUnit + bindingCostPerUnit;
  let isCustomPricing = false;

  if (priceOverride !== undefined && priceOverride !== null) {
    unitPrice = priceOverride;
    isCustomPricing = true;
  }

  const printingCost = printingCostPerUnit * copies;
  const bindingCost = bindingCostPerUnit * copies;
  const subtotal = unitPrice * copies;

  // Delivery and Platform fee will be added at the cart/order level.
  // This function returns the item level breakdown.
  return {
    printingCost,
    bindingCost,
    subtotal,
    unitPrice,
    isCustomPricing,
    printingRate: printRate,
    bindingRate: bindingCostPerUnit
  };
}

export function calculateOrderTotal(itemSubtotals, deliveryMethod, pricingSettings = null) {
  const settings = pricingSettings || DEFAULT_PRICING_SETTINGS;
  
  const subtotal = itemSubtotals.reduce((sum, val) => sum + val, 0);
  
  const deliveryFee = deliveryMethod === 'delivery' ? settings.defaultDeliveryFee : 0;
  
  const platformFee = settings.platformFeeEnabled ? settings.platformFee : 0;
  
  const grandTotal = subtotal + deliveryFee + platformFee;
  
  return {
    subtotal,
    deliveryFee,
    platformFee,
    grandTotal
  };
}
