import { errorResponse, successResponse } from '../utils/response.js';
import { calculateManualPrice, calculateOrderTotal, calculateOfferDiscount } from '../services/pricingService.js';

export async function handleCalculatePricing(request, env, context) {
  try {
    const body = await request.json();
    const { items, deliveryMethod, couponCode } = body;

    if (!items || !Array.isArray(items)) {
      return errorResponse('BAD_REQUEST', 'Items array is required', 400);
    }

    // Fetch pricing settings
    const settingsResult = await env.DB.prepare(`SELECT setting_value FROM platform_settings WHERE setting_key = 'pricing_settings'`).first();
    let pricingSettings = null;
    if (settingsResult && settingsResult.setting_value) {
      try {
        pricingSettings = JSON.parse(settingsResult.setting_value);
      } catch (e) {}
    }

    // Fetch launch pricing settings
    const launchResult = await env.DB.prepare(`SELECT setting_value FROM platform_settings WHERE setting_key = 'launch_pricing_settings'`).first();
    let launchPricing = null;
    if (launchResult && launchResult.setting_value) {
      try {
        launchPricing = JSON.parse(launchResult.setting_value);
      } catch (e) {}
    }

    // Fetch binding pricing rules
    const rulesResult = await env.DB.prepare(`SELECT id, min_pages, max_pages, price, is_active FROM binding_pricing_rules`).all();
    const bindingRules = rulesResult.results || [];

    const itemSubtotals = [];
    const detailedItems = [];
    let hasBindingError = false;

    for (const item of items) {
      let pages = item.pages || 0;
      let priceOverride = item.priceOverride || null;

      if (item.serviceType === 'manual') {
        const manualId = item.manualId || item.referenceId;
        const manual = await env.DB.prepare('SELECT pages, price_override, pricing_mode FROM manuals WHERE id = ?').bind(manualId).first();
        if (!manual) return errorResponse('NOT_FOUND', `Manual ${manualId} not found`, 404);
        pages = manual.pages;
        priceOverride = manual.price_override;
        let pricingMode = manual.pricing_mode || 'settings';
      } else if (item.serviceType === 'hall_ticket' || item.serviceType === 'custom') {
        const documentId = item.documentId || item.referenceId;
        if (documentId) {
          const doc = await env.DB.prepare('SELECT page_count FROM documents WHERE id = ?').bind(documentId).first();
          if (doc) {
            pages = doc.page_count;
          } else {
            // Background upload might not be finished yet, trust the frontend payload
            pages = item.pages || 0;
            item.requires_page_verification = true;
          }
        } else {
          pages = item.pages || 0;
          item.requires_page_verification = true;
        }
      } else if (item.serviceType === 'code_tantra_files') {
        const documentId = item.documentId || item.referenceId;
        if (documentId) {
          const cf = await env.DB.prepare('SELECT page_count FROM custom_files WHERE id = ? AND is_deleted = 0').bind(documentId).first();
          if (!cf) return errorResponse('NOT_FOUND', `Custom file ${documentId} not found`, 404);
          pages = cf.page_count;
        } else {
          pages = item.pages || 0;
        }
        item.requires_page_verification = true;
      }

      const pricing = calculateManualPrice(pages, item.printOptions, pricingSettings, priceOverride, bindingRules, launchPricing);
      
      if (pricing.bindingError) {
        return errorResponse('BAD_REQUEST', pricing.bindingError, 400);
      }

      itemSubtotals.push(pricing.subtotal);
      
      detailedItems.push({
        id: item.id || Math.random().toString(36).substring(7),
        requires_page_verification: item.requires_page_verification || false,
        ...pricing
      });
    }

    let couponDiscount = 0;
    let couponError = null;
    let appliedCoupon = null;

    let offerDiscount = 0;
    let appliedOffer = null;
    let offerDetails = null;
    let offerError = null;

    const { offerCode } = body;
    const nowTime = Date.now();

    // Mutual exclusivity check: coupon and offer cannot be combined
    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const normalizedCode = couponCode.trim().toUpperCase();
      const coupon = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ?`).bind(normalizedCode).first();
      
      if (!coupon) {
        couponError = 'Invalid coupon code';
      } else if (coupon.is_active !== 1) {
        couponError = 'Coupon is inactive';
      } else if (coupon.valid_until && coupon.valid_until < nowTime) {
        couponError = 'Coupon has expired';
      } else if (coupon.usage_limit && coupon.current_usage >= coupon.usage_limit) {
        couponError = 'Coupon usage limit reached';
      } else {
        couponDiscount = coupon.discount_amount;
        appliedCoupon = normalizedCode;
      }
    } else {
      // Evaluate offer if no coupon is active
      let offer = null;
      if (offerCode && typeof offerCode === 'string' && offerCode.trim().length > 0 && offerCode.trim().toUpperCase() !== 'NONE') {
        offer = await env.DB.prepare(`SELECT * FROM offers WHERE code = ? AND is_active = 1`).bind(offerCode.trim().toUpperCase()).first();
        if (!offer) {
          offerError = 'Offer code not found or inactive';
        }
      }

      if (offer) {
        const isTimeValid = (!offer.start_time || offer.start_time <= nowTime) && (!offer.end_time || offer.end_time >= nowTime);
        const subtotalSum = itemSubtotals.reduce((a, b) => a + b, 0);
        const isMinOrderMet = !offer.min_order_amount || subtotalSum >= offer.min_order_amount;

        if (!isTimeValid) {
          offerError = 'Offer has expired or is not yet active';
        } else if (!isMinOrderMet) {
          offerError = `Minimum order amount of ₹${offer.min_order_amount} required`;
        } else {
          offerDiscount = calculateOfferDiscount(items.map((it, idx) => ({ ...it, ...detailedItems[idx] })), offer);
          if (offerDiscount > 0) {
            appliedOffer = offer.code;
            offerDetails = {
              id: offer.id,
              code: offer.code,
              title: offer.title,
              badgeText: offer.badge_text || `${offer.discount_value}% OFF`,
              discountType: offer.discount_type,
              discountValue: offer.discount_value,
              discountAmount: offerDiscount,
              savingsAmount: offerDiscount,
              termsText: offer.terms_text
            };
          }
        }
      }
    }

    const orderTotal = calculateOrderTotal(itemSubtotals, deliveryMethod || 'delivery', pricingSettings, couponDiscount, offerDiscount);

    const isLaunchActive = detailedItems.some(i => i.isLaunchActive);
    const totalLaunchSavings = detailedItems.reduce((acc, i) => acc + (i.launchSavings || 0), 0);

    // Also enrich detailedItems with item-level discount breakdown for printing screen display
    const enrichedItems = detailedItems.map(item => {
      let itemDiscount = 0;
      if (offerDiscount > 0 && offerDetails && item.printingCost > 0) {
        // Percentage discount on printingCost
        if (offerDetails.discountType === 'percentage') {
          itemDiscount = Math.round(((item.printingCost * offerDetails.discountValue) / 100.0) * 100) / 100;
        } else {
          itemDiscount = Math.min(offerDiscount, item.printingCost);
        }
      }
      return {
        ...item,
        // In launch mode, item.originalPrintingCost contains the unreduced configured rate
        originalPrintingCost: item.originalPrintingCost !== undefined ? item.originalPrintingCost : item.printingCost,
        discountedPrintingCost: Math.max(0, item.printingCost - itemDiscount),
        printingSavings: itemDiscount,
        itemDiscount: itemDiscount
      };
    });

    const totalOriginalSubtotal = detailedItems.reduce((acc, i) => acc + (i.originalSubtotal !== undefined ? i.originalSubtotal : i.subtotal), 0);
    const totalOriginalPrintingCost = detailedItems.reduce((acc, i) => acc + (i.originalPrintingCost !== undefined ? i.originalPrintingCost : (i.printingCost || 0)), 0);
    const totalPrintingCost = detailedItems.reduce((acc, i) => acc + (i.printingCost || 0), 0);
    const totalOriginalBindingCost = detailedItems.reduce((acc, i) => acc + (i.originalBindingCost !== undefined ? i.originalBindingCost : (i.bindingCost || 0)), 0);
    const totalBindingCost = detailedItems.reduce((acc, i) => acc + (i.bindingCost || 0), 0);

    return successResponse({
      items: enrichedItems,
      summary: {
        ...orderTotal,
        originalSubtotal: Math.round(totalOriginalSubtotal * 100) / 100,
        originalPrintingCost: Math.round(totalOriginalPrintingCost * 100) / 100,
        printingCost: Math.round(totalPrintingCost * 100) / 100,
        originalBindingCost: Math.round(totalOriginalBindingCost * 100) / 100,
        bindingCost: Math.round(totalBindingCost * 100) / 100,
        appliedOffer,
        offerDiscount,
        savings: offerDiscount || couponDiscount || 0,
        isLaunchActive,
        launchSavings: totalLaunchSavings
      },
      isLaunchActive,
      launchSavings: totalLaunchSavings,
      couponError,
      appliedCoupon,
      appliedOffer,
      offerDetails,
      offerError
    });
  } catch (err) {
    console.error('Calculate Pricing Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to calculate pricing', 500);
  }
}

