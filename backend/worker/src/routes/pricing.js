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

      if (item.serviceType === 'manual') {
        const manualId = item.manualId || item.referenceId;
        const manual = await env.DB.prepare('SELECT pages, price_override, pricing_mode FROM manuals WHERE id = ?').bind(manualId).first();
        if (!manual) return errorResponse('NOT_FOUND', `Manual ${manualId} not found`, 404);
        pages = manual.pages;
        priceOverride = manual.price_override;
        let pricingMode = manual.pricing_mode || 'settings';
      } else if (item.serviceType === 'hall_ticket' || item.serviceType === 'custom') {
        const documentId = item.documentId || item.referenceId;
        const doc = await env.DB.prepare('SELECT page_count FROM documents WHERE id = ?').bind(documentId).first();
        if (!doc) return errorResponse('NOT_FOUND', `Document ${documentId} not found`, 404);
        pages = doc.page_count;
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

      const pricing = calculateManualPrice(pages, item.printOptions, pricingSettings, priceOverride, bindingRules);
      
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

    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const normalizedCode = couponCode.trim().toUpperCase();
      const coupon = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ?`).bind(normalizedCode).first();
      
      const nowTime = Date.now();
      
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

