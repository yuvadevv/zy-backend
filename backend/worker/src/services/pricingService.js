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

export function calculateManualPrice(pages, printOptions, pricingSettings = null, priceOverride = null, bindingRules = [], launchPricing = null) {
  const settings = pricingSettings || DEFAULT_PRICING_SETTINGS;
  
  const isColor = printOptions.color;
  const isSingleSided = printOptions.singleSided;
  const bindingType = printOptions.bindingType; // 'none', 'spiral'
  const copies = printOptions.copies || 1;

  // Determine if launch pricing is active
  let isLaunchActive = false;
  const now = Date.now();
  if (launchPricing && launchPricing.enabled) {
    const afterStart = !launchPricing.startDate || new Date(launchPricing.startDate).getTime() <= now;
    const beforeEnd = !launchPricing.endDate || new Date(launchPricing.endDate).getTime() >= now;
    if (afterStart && beforeEnd) {
      isLaunchActive = true;
    }
  }

  // Original configured printing rate
  let originalPrintRate = 0;
  if (!isColor) {
    originalPrintRate = isSingleSided ? settings.printRates.bw_single : settings.printRates.bw_double;
  } else {
    originalPrintRate = isSingleSided ? settings.printRates.color_single : settings.printRates.color_double;
  }

  // Active printing rate
  let printRate = originalPrintRate;
  if (isLaunchActive && launchPricing.printRates) {
    let proposedRate = null;
    if (!isColor) {
      proposedRate = isSingleSided ? launchPricing.printRates.bw_single : launchPricing.printRates.bw_double;
    } else {
      proposedRate = isSingleSided ? launchPricing.printRates.color_single : launchPricing.printRates.color_double;
    }
    if (proposedRate !== undefined && proposedRate !== null && proposedRate !== '') {
      printRate = Number(proposedRate);
    }
  }
  
  // For double sided, we divide pages by 2 (ceiling).
  const sheets = isSingleSided ? pages : Math.ceil(pages / 2);
  const printingCostPerUnit = sheets * printRate;
  const originalPrintingCostPerUnit = sheets * originalPrintRate;
  
  let bindingCostPerUnit = settings.bindingFees.none || 0;
  let originalBindingCostPerUnit = settings.bindingFees.none || 0;
  let bindingRuleId = null;
  let bindingError = null;

  if (bindingType === 'spiral') {
    // Dynamically calculate based on binding rules
    if (bindingRules && bindingRules.length > 0) {
      const activeRules = bindingRules.filter(r => r.is_active === 1 || r.is_active === true);
      const matchedRule = activeRules.find(r => pages >= r.min_pages && pages <= r.max_pages);
      
      if (matchedRule) {
        originalBindingCostPerUnit = matchedRule.customer_unit_price || matchedRule.price || 0;
        bindingRuleId = matchedRule.id;

        // Check if launch pricing has a mapped proposed binding rate for this range
        if (isLaunchActive && Array.isArray(launchPricing.bindingRules)) {
          const launchRule = launchPricing.bindingRules.find(
            lr => lr.min_pages === matchedRule.min_pages && lr.max_pages === matchedRule.max_pages
          );
          if (launchRule && launchRule.price !== undefined && launchRule.price !== null && launchRule.price !== '') {
            bindingCostPerUnit = Number(launchRule.price);
          } else {
            bindingCostPerUnit = originalBindingCostPerUnit;
          }
        } else {
          bindingCostPerUnit = originalBindingCostPerUnit;
        }
      } else {
        bindingError = 'Spiral binding is currently unavailable for this page count.';
      }
    } else {
      // Fallback if no rules exist
      originalBindingCostPerUnit = settings.bindingFees.spiral || 30.0;
      bindingCostPerUnit = originalBindingCostPerUnit;
    }
  } else if (bindingType === 'softbound') {
    originalBindingCostPerUnit = settings.bindingFees.soft_bound || 50.0;
    bindingCostPerUnit = originalBindingCostPerUnit;
  } else if (bindingType === 'hardbound') {
    originalBindingCostPerUnit = settings.bindingFees.hard_bound || 100.0;
    bindingCostPerUnit = originalBindingCostPerUnit;
  } else if (bindingType === 'none') {
    originalBindingCostPerUnit = 0;
    bindingCostPerUnit = 0;
  }
  
  let unitPrice = printingCostPerUnit + bindingCostPerUnit;
  let originalUnitPrice = originalPrintingCostPerUnit + originalBindingCostPerUnit;
  let isCustomPricing = false;

  if (priceOverride !== undefined && priceOverride !== null) {
    unitPrice = priceOverride;
    originalUnitPrice = priceOverride;
    isCustomPricing = true;
  }

  const printingCost = printingCostPerUnit * copies;
  const originalPrintingCost = originalPrintingCostPerUnit * copies;
  const bindingCost = bindingCostPerUnit * copies;
  const originalBindingCost = originalBindingCostPerUnit * copies;
  const subtotal = unitPrice * copies;
  const originalSubtotal = originalUnitPrice * copies;

  // Calculate launch savings
  const launchPrintingSavings = Math.max(0, originalPrintingCost - printingCost);
  const launchBindingSavings = Math.max(0, originalBindingCost - bindingCost);
  const launchSavings = Math.max(0, originalSubtotal - subtotal);
  const launchSavingsPercentage = originalSubtotal > 0 && launchSavings > 0
    ? Math.round((launchSavings / originalSubtotal) * 1000) / 10
    : 0;

  // Delivery and Platform fee will be added at the cart/order level.
  // This function returns the item level breakdown.
  return {
    printingCost,
    originalPrintingCost,
    bindingCost,
    originalBindingCost,
    subtotal,
    originalSubtotal,
    unitPrice,
    originalUnitPrice,
    isCustomPricing,
    printingRate: printRate,
    originalPrintingRate: originalPrintRate,
    bindingRate: bindingCostPerUnit,
    originalBindingRate: originalBindingCostPerUnit,
    bindingRuleId,
    bindingError,
    isLaunchActive,
    launchSavings,
    launchSavingsPercentage,
    launchPrintingSavings,
    launchBindingSavings
  };
}

export function calculateOfferDiscount(itemsWithPricing, offer) {
  if (!offer) return 0;
  
  let eligibleServices = ['all'];
  try {
    if (typeof offer.eligible_services === 'string') {
      eligibleServices = JSON.parse(offer.eligible_services);
    } else if (Array.isArray(offer.eligible_services)) {
      eligibleServices = offer.eligible_services;
    }
  } catch (e) {}

  let eligibleComponents = ['printing'];
  try {
    if (typeof offer.eligible_components === 'string') {
      eligibleComponents = JSON.parse(offer.eligible_components);
    } else if (Array.isArray(offer.eligible_components)) {
      eligibleComponents = offer.eligible_components;
    }
  } catch (e) {}

  let eligibleSum = 0;
  for (const item of itemsWithPricing) {
    const isServiceEligible = eligibleServices.includes('all') || eligibleServices.includes(item.serviceType);
    if (!isServiceEligible) continue;

    // Calculate sum of eligible components for this item
    let itemEligibleCost = 0;
    if (eligibleComponents.includes('printing')) {
      itemEligibleCost += (item.printingCost || 0);
    }
    if (eligibleComponents.includes('binding')) {
      itemEligibleCost += (item.bindingCost || 0);
    }
    if (eligibleComponents.includes('all')) {
      itemEligibleCost = item.subtotal || 0;
    }
    eligibleSum += itemEligibleCost;
  }

  if (eligibleSum <= 0) return 0;

  let calculatedDiscount = 0;
  if (offer.discount_type === 'percentage') {
    calculatedDiscount = (eligibleSum * offer.discount_value) / 100.0;
    if (offer.max_discount_amount && calculatedDiscount > offer.max_discount_amount) {
      calculatedDiscount = offer.max_discount_amount;
    }
  } else if (offer.discount_type === 'fixed') {
    calculatedDiscount = Math.min(offer.discount_value, eligibleSum);
  }

  // Round to 2 decimal places
  return Math.round(calculatedDiscount * 100) / 100;
}

export function calculateOrderTotal(itemSubtotals, deliveryMethod, pricingSettings = null, couponDiscount = 0, offerDiscount = 0) {
  const settings = pricingSettings || DEFAULT_PRICING_SETTINGS;
  
  const subtotal = itemSubtotals.reduce((sum, val) => sum + val, 0);
  
  const deliveryFee = deliveryMethod === 'delivery' ? settings.defaultDeliveryFee : 0;
  
  const platformFee = settings.platformFeeEnabled ? settings.platformFee : 0;
  
  // Stacking rule: mutual exclusivity is enforced upstream, but safe fallback here
  const combinedDiscount = couponDiscount > 0 ? couponDiscount : offerDiscount;
  const actualDiscount = Math.min(combinedDiscount, subtotal);
  
  let grandTotal = subtotal + deliveryFee + platformFee - actualDiscount;
  if (grandTotal < 0) {
    grandTotal = 0;
  }
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    couponDiscount: couponDiscount > 0 ? Math.round(actualDiscount * 100) / 100 : 0,
    offerDiscount: couponDiscount > 0 ? 0 : (offerDiscount > 0 ? Math.round(actualDiscount * 100) / 100 : 0),
    discount: Math.round(actualDiscount * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100
  };
}
