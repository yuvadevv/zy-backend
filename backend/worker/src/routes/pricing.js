import { errorResponse, successResponse } from '../utils/response.js';
import { calculateManualPrice, calculateOrderTotal } from '../services/pricingService.js';

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

    // Fetch binding pricing rules
    const rulesResult = await env.DB.prepare(`SELECT id, min_pages, max_pages, price, is_active FROM binding_pricing_rules`).all();
    const bindingRules = rulesResult.results || [];

    const itemSubtotals = [];
    const detailedItems = [];
    let hasBindingError = false;

    for (const item of items) {
      let pages = item.pages || 0;
      let priceOverride = item.priceOverride || null;

      if (item.serviceType === 'manual' && item.manualId) {
        const manual = await env.DB.prepare(`SELECT pages, price_override FROM manuals WHERE id = ?`).bind(item.manualId).first();
        if (manual) {
          pages = manual.pages;
          priceOverride = manual.price_override;
        }
      } else if ((item.serviceType === 'hall_ticket' || item.serviceType === 'custom') && item.documentId) {
        const doc = await env.DB.prepare(`SELECT page_count FROM documents WHERE id = ?`).bind(item.documentId).first();
        if (doc) {
          pages = doc.page_count;
        }
      } else if (item.serviceType === 'code_tantra_files') {
        pages = item.pages || (item.meta && item.meta.totalPages) || 0;
      }

      const pricing = calculateManualPrice(pages, item.printOptions, pricingSettings, priceOverride, bindingRules);
      
      if (pricing.bindingError) {
        return errorResponse('BAD_REQUEST', pricing.bindingError, 400);
      }

      itemSubtotals.push(pricing.subtotal);
      
      detailedItems.push({
        id: item.id || Math.random().toString(36).substring(7),
        ...pricing
      });
    }

    let couponDiscount = 0;
    let couponError = null;
    let appliedCoupon = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const normalizedCode = couponCode.trim().toUpperCase();
      const coupon = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ?`).bind(normalizedCode).first();
      
      if (!coupon) {
        couponError = 'Invalid coupon code';
      } else if (coupon.is_active !== 1) {
        couponError = 'Coupon is inactive';
      } else {
        couponDiscount = coupon.discount_amount;
        appliedCoupon = normalizedCode;
      }
    }

    const orderTotal = calculateOrderTotal(itemSubtotals, deliveryMethod || 'delivery', pricingSettings, couponDiscount);

    return successResponse({
      items: detailedItems,
      summary: orderTotal,
      couponError,
      appliedCoupon
    });
  } catch (err) {
    console.error('Calculate Pricing Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to calculate pricing', 500);
  }
}

