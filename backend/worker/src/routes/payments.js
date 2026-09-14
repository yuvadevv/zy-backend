import { errorResponse, successResponse } from '../utils/response.js';
import { createPayment, getPaymentByOrderId, verifyDevelopmentPayment, markPaymentPaid } from '../services/paymentService.js';
import { PaymentProvider } from '../services/paymentProvider.js';

export async function handleCreatePayment(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { orderId } = body; // This is now the payment_attempt_id

    if (!orderId || !orderId.startsWith('pa_')) {
      return errorResponse('BAD_REQUEST', 'Invalid payment session ID', 400);
    }

    // 1. Verify payment attempt ownership
    const attempt = await env.DB.prepare(`
      SELECT * 
      FROM payment_attempts 
      WHERE id = ? AND user_id = ?
    `).bind(orderId, studentId).first();

    if (!attempt) {
      return errorResponse('NOT_FOUND', 'Payment session not found', 404);
    }

    if (attempt.status === 'paid') {
      return errorResponse('CONFLICT', 'Session is already paid', 409);
    }

    if (attempt.calculated_amount < 1) {
      return errorResponse('BAD_REQUEST', 'Invalid order total', 400);
    }

    // 2. Check Gateway Configuration
    const provider = new PaymentProvider(env);
    const config = await provider.getGatewaySettings();

    if (!config.enabled) {
      return errorResponse('FORBIDDEN', 'Payment gateway is currently disabled', 403);
    }

    // 3. Return existing if pending
    if (attempt.status === 'pending' && attempt.razorpay_order_id) {
        return successResponse({
          providerOrderId: attempt.razorpay_order_id,
          amount: attempt.calculated_amount,
          currency: attempt.currency,
          keyId: env.RAZORPAY_KEY_ID
        });
    }

    let providerOrderId;
    let paymentCurrency = 'INR';

    // 4. Development Mock Mode Fallback Check
    const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';

    if (isDevMock) {
      providerOrderId = `mock_order_${attempt.id.substring(0, 10)}_${Date.now()}`;
    } else {
      // 5. Create real Razorpay order
      const receiptId = `rcpt_${attempt.id.substring(3, 13)}`;
      try {
        const gwOrder = await provider.createOrder(attempt.calculated_amount, paymentCurrency, receiptId);
        providerOrderId = gwOrder.id;
      } catch (err) {
        return errorResponse('SERVER_ERROR', 'Failed to initialize payment gateway', 500);
      }
    }

    // 6. Record payment intent
    await env.DB.prepare(`
      UPDATE payment_attempts 
      SET razorpay_order_id = ?, status = 'pending', updated_at = ?
      WHERE id = ?
    `).bind(providerOrderId, Date.now(), attempt.id).run();

    return successResponse({
      providerOrderId: providerOrderId,
      amount: attempt.calculated_amount,
      currency: paymentCurrency,
      keyId: isDevMock ? 'mock_key' : env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error('Create Payment Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create payment', 500);
  }
}

export async function handleVerifyPayment(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { providerOrderId, providerPaymentId, providerSignature } = body;

    if (!providerOrderId || !providerPaymentId) {
      return errorResponse('BAD_REQUEST', 'Missing payment credentials', 400);
    }

    // Find the payment attempt
    const attempt = await env.DB.prepare(`
      SELECT * FROM payment_attempts WHERE razorpay_order_id = ? AND user_id = ?
    `).bind(providerOrderId, studentId).first();

    if (!attempt) {
      return errorResponse('NOT_FOUND', 'Payment session not found', 404);
    }

    if (attempt.status === 'paid') {
      return successResponse({ status: 'paid' });
    }

    // Signature Verification
    const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';
    if (!isDevMock) {
      if (!providerSignature) {
        return errorResponse('BAD_REQUEST', 'Missing signature', 400);
      }
      const provider = new PaymentProvider(env);
      const isValid = await provider.verifySignature(providerOrderId, providerPaymentId, providerSignature);
      if (!isValid) {
        // Mark attempt as verification_failed
        await env.DB.prepare(`UPDATE payment_attempts SET status = 'verification_failed', updated_at = ? WHERE id = ?`).bind(Date.now(), attempt.id).run();
        return errorResponse('BAD_REQUEST', 'Invalid payment signature', 400);
      }
    }

    // 1. Process Checkout Payload
    const payload = JSON.parse(attempt.checkout_payload);
    const { items, orderTotal, etaMs, branchCode } = payload;
    
    // Fetch active vendor pricing rules
    const vendorRules = await env.DB.prepare(`SELECT * FROM vendor_blintzy_pricing WHERE is_active = 1`).all();
    const rules = vendorRules.results || [];
    
    let totalVendorPayable = 0;
    let totalBlintzyGross = 0;
    const finalItems = [];
    const nowMs = Date.now();

    // 2. Compute Vendor Cost for Each Item
    for (const item of items) {
      // Find matching vendor rule for this service
      let matchedRule = null;
      if (item.binding_type === 'spiral') {
         matchedRule = rules.find(r => r.service_type === 'spiral_binding' && item.page_count >= r.min_pages && item.page_count <= r.max_pages);
      } else {
         const sType = item.print_type === 'color' ? (item.print_side === 'single' ? 'color_single' : 'color_double') : (item.print_side === 'single' ? 'bw_single' : 'bw_double');
         matchedRule = rules.find(r => r.service_type === sType);
      }
      
      let vendorUnit = matchedRule ? matchedRule.vendor_unit_price : 0;
      let blintzyUnit = matchedRule ? matchedRule.blintzy_unit_earning : item.base_price;
      
      const vTotal = vendorUnit * item.copies * (item.binding_type === 'spiral' ? 1 : item.page_count);
      const bTotal = item.item_total - vTotal;
      
      totalVendorPayable += vTotal;
      totalBlintzyGross += bTotal;
      
      finalItems.push({
         ...item,
         vendor_unit_price: vendorUnit,
         vendor_total: vTotal,
         blintzy_unit_earning: blintzyUnit,
         blintzy_total_earning: bTotal,
         pricing_rule_id: matchedRule ? matchedRule.id : null,
         pricing_rule_snapshot: matchedRule ? JSON.stringify(matchedRule) : null
      });
    }

    // Add Delivery Rule 
    const deliveryRule = rules.find(r => r.service_type === 'delivery');
    if (deliveryRule && orderTotal.deliveryFee > 0) {
       totalVendorPayable += deliveryRule.vendor_unit_price;
       totalBlintzyGross += deliveryRule.blintzy_unit_earning;
    } else {
       totalBlintzyGross += orderTotal.deliveryFee;
    }

    // Generate Order ID
    const { generateOrderId } = await import('./orders.js');
    const publicOrderId = await generateOrderId(env.DB, branchCode);
    const internalOrderId = crypto.randomUUID();

    // 3. Database Transaction
    const stmts = [];
    const orderType = finalItems[0].item_type;
    let deliveryBuilding = payload.deliveryDetails?.building || null;
    let deliveryRoom = payload.deliveryDetails?.roomNumber || payload.deliveryDetails?.room || null;

    stmts.push(env.DB.prepare(`
      INSERT INTO orders (
        internal_id, public_id, student_id, status, internal_status,
        order_type, delivery_type, delivery_building, delivery_room,
        platform_fee, gst, delivery_fee, discount, grand_total,
        estimated_delivery, created_at, updated_at, coupon_code,
        payment_attempt_id, razorpay_order_id, razorpay_payment_id, payment_status,
        payment_verified_at, vendor_payable_total, blintzy_gross_earning,
        payment_gateway_fee, refunds_total, adjustments_total, blintzy_net_earning, revenue_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      internalOrderId, publicOrderId, studentId, 'received', 'processing',
      orderType, 'classroom', deliveryBuilding, deliveryRoom,
      orderTotal.platformFee, 0, orderTotal.deliveryFee, orderTotal.couponDiscount, orderTotal.grandTotal,
      etaMs, nowMs, nowMs, payload.couponCode,
      attempt.id, providerOrderId, providerPaymentId, 'paid',
      nowMs, totalVendorPayable, totalBlintzyGross,
      0, 0, 0, totalBlintzyGross, 'unsettled'
    ));

    for (const item of finalItems) {
      const itemId = crypto.randomUUID();
      stmts.push(env.DB.prepare(`
        INSERT INTO order_items (
          id, order_id, item_type, manual_id, document_id, custom_file_id, copies, page_count,
          paper_size, print_type, color_mode, binding_type, pricing_mode,
          printing_rate, binding_rate, binding_rule_id, base_price, printing_cost, binding_cost,
          item_total, created_at,
          customer_unit_price, customer_total, vendor_unit_price, vendor_total,
          blintzy_unit_earning, blintzy_total_earning, pricing_rule_id, pricing_rule_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId, internalOrderId, item.item_type, item.manual_id, item.document_id, item.custom_file_id,
        item.copies, item.page_count, item.paper_size, item.print_type, item.color_mode, 
        item.binding_type, item.pricing_mode, item.printing_rate, item.binding_rate, item.binding_rule_id,
        item.base_price, item.printing_cost, item.binding_cost, item.item_total, nowMs,
        item.base_price, item.item_total, item.vendor_unit_price, item.vendor_total,
        item.blintzy_unit_earning, item.blintzy_total_earning, item.pricing_rule_id, item.pricing_rule_snapshot
      ));
      
      if (item.document_id) {
          stmts.push(env.DB.prepare(`UPDATE documents SET order_id = ? WHERE id = ?`).bind(internalOrderId, item.document_id));
      }
      if (item.custom_file_id) {
          stmts.push(env.DB.prepare(`UPDATE custom_files SET order_id = ? WHERE id = ?`).bind(internalOrderId, item.custom_file_id));
      }
      if (item.item_type === 'manual') {
          stmts.push(env.DB.prepare(`UPDATE manuals SET stock = stock - ? WHERE id = ?`).bind(item.copies, item.manual_id));
      }
    }

    // Finalize custom files
    stmts.push(env.DB.prepare(`
      UPDATE custom_files 
      SET upload_status = 'READY', is_temporary = 0, updated_at = ? 
      WHERE order_id = ? AND is_deleted = 0
    `).bind(nowMs, internalOrderId));

    // Update payment attempt
    stmts.push(env.DB.prepare(`
      UPDATE payment_attempts SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ?, paid_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(providerPaymentId, providerSignature || null, nowMs, nowMs, attempt.id));

    await env.DB.batch(stmts);

    return successResponse({
      status: 'paid',
      orderId: publicOrderId
    });

  } catch (err) {
    console.error('Verify Payment Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to verify payment', 500);
  }
}

export async function handlePaymentWebhook(request, env) {
  try {
    const signature = request.headers.get('X-Razorpay-Signature');
    if (!signature) {
      return errorResponse('BAD_REQUEST', 'Missing signature', 400);
    }

    const rawBody = await request.text();
    const provider = new PaymentProvider(env);

    try {
      const isValid = await provider.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        return errorResponse('BAD_REQUEST', 'Invalid webhook signature', 400);
      }
    } catch(err) {
      return errorResponse('SERVER_ERROR', 'Webhook verification failed', 500);
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    
    // Hash payload for audit
    const payloadHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody)))
    ).map(b => b.toString(16).padStart(2, '0')).join('');

    // Safe event ID fallback
    const providerEventId = request.headers.get('x-razorpay-event-id') 
      || `rzp_evt_${payloadHash.substring(0, 16)}`;

    // Check idempotency
    const existingEvent = await env.DB.prepare(`
      SELECT * FROM webhook_events WHERE provider = 'razorpay' AND provider_event_id = ?
    `).bind(providerEventId).first();

    if (existingEvent) {
      return successResponse({ status: 'ok', message: 'Already processed' });
    }

    // Insert into webhook_events as received
    await env.DB.prepare(`
      INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_hash, processing_status, received_at, created_at
      ) VALUES (?, 'razorpay', ?, ?, ?, 'received', ?, ?)
    `).bind(
      crypto.randomUUID(), providerEventId, eventType, payloadHash, Date.now(), Date.now()
    ).run();

    let processingStatus = 'processed';
    let errorMessage = null;

    try {
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = event.payload.payment.entity;
        const orderId = paymentEntity.order_id;
        
        const payment = await env.DB.prepare(`SELECT * FROM payments WHERE provider_order_id = ?`).bind(orderId).first();
        if (payment && payment.status === 'pending') {
          await env.DB.prepare(`
            UPDATE payments SET status = 'paid', provider_payment_id = ?, paid_at = ?, updated_at = ?
            WHERE id = ?
          `).bind(paymentEntity.id, Date.now(), Date.now(), payment.id).run();
          
          const order = await env.DB.prepare(`SELECT * FROM orders WHERE internal_id = ?`).bind(payment.order_id).first();
          if (order && (order.status === 'payment_pending' || order.status === 'received' || order.status === 'pending')) {
            const nextStatus = order.status === 'payment_pending' ? 'received' : 'printing';
            await env.DB.prepare(`UPDATE orders SET status = ?, internal_status = ?, updated_at = ? WHERE internal_id = ?`).bind(nextStatus, 'processing', Date.now(), order.internal_id).run();
            
            if (order.status === 'payment_pending') {
              const items = await env.DB.prepare(`SELECT manual_id, copies FROM order_items WHERE order_id = ? AND item_type = 'manual'`).bind(order.internal_id).all();
              if (items.results && items.results.length > 0) {
                const stockStmts = items.results.map(item => env.DB.prepare(`UPDATE manuals SET stock = stock - ? WHERE id = ?`).bind(item.copies, item.manual_id));
                await env.DB.batch(stockStmts);
              }
            }
          }
          // Finalize custom files
          await env.DB.prepare(`
            UPDATE custom_files 
            SET upload_status = 'READY', is_temporary = 0, updated_at = ? 
            WHERE order_id = ? AND is_deleted = 0
          `).bind(Date.now(), payment.order_id).run();
        }
      } else if (eventType === 'payment.failed') {
        const paymentEntity = event.payload.payment.entity;
        const orderId = paymentEntity.order_id;
        const payment = await env.DB.prepare(`SELECT * FROM payments WHERE provider_order_id = ?`).bind(orderId).first();
        if (payment && payment.status === 'pending') {
          await env.DB.prepare(`UPDATE payments SET status = 'failed', updated_at = ? WHERE id = ?`).bind(Date.now(), payment.id).run();
        }
      } else if (eventType === 'refund.created' || eventType === 'refund.processed' || eventType === 'refund.failed') {
        const refundEntity = event.payload.refund.entity;
        const refundId = refundEntity.id;
        const paymentId = refundEntity.payment_id;
        
        let refund = await env.DB.prepare(`SELECT * FROM refunds WHERE provider_refund_id = ?`).bind(refundId).first();
        
        if (!refund) {
          // Sometimes refund.processed arrives first, if we didn't initiate it, we just skip or we could reconcile.
          // Since Admin initiates refunds, it should exist by provider_refund_id, or at least we skip.
          processingStatus = 'ignored';
          errorMessage = 'Refund record not found in system';
        } else {
          // Update status
          if (eventType === 'refund.processed' && refund.status !== 'processed') {
            await env.DB.prepare(`UPDATE refunds SET status = 'processed', processed_at = ?, updated_at = ? WHERE id = ?`).bind(Date.now(), Date.now(), refund.id).run();
            // Create Notification
            await env.DB.prepare(`
              INSERT INTO notifications (id, student_id, type, title, message, related_order_id, related_refund_id, dedupe_key, created_at)
              VALUES (?, ?, 'refund_processed', 'Refund Completed', 'Your refund for order has been completed successfully.', ?, ?, ?, ?)
              ON CONFLICT(dedupe_key) DO NOTHING
            `).bind(crypto.randomUUID(), refund.student_id, refund.order_id, refund.id, `refund_processed_${refund.id}`, Date.now()).run();
          } else if (eventType === 'refund.failed' && refund.status !== 'processed') {
            await env.DB.prepare(`UPDATE refunds SET status = 'failed', failed_at = ?, failure_reason = ?, updated_at = ? WHERE id = ?`).bind(Date.now(), 'Webhook reported failure', Date.now(), refund.id).run();
            // Create Notification
            await env.DB.prepare(`
              INSERT INTO notifications (id, student_id, type, title, message, related_order_id, related_refund_id, dedupe_key, created_at)
              VALUES (?, ?, 'refund_failed', 'Refund Failed', 'Your refund could not be processed.', ?, ?, ?, ?)
              ON CONFLICT(dedupe_key) DO NOTHING
            `).bind(crypto.randomUUID(), refund.student_id, refund.order_id, refund.id, `refund_failed_${refund.id}`, Date.now()).run();
          }
        }
      } else {
        processingStatus = 'ignored';
      }
    } catch (processErr) {
      processingStatus = 'failed';
      errorMessage = processErr.message;
    }

    // Update webhook event status
    await env.DB.prepare(`
      UPDATE webhook_events SET processing_status = ?, processed_at = ?, error_message = ? WHERE provider_event_id = ?
    `).bind(processingStatus, Date.now(), errorMessage, providerEventId).run();

    return successResponse({ status: 'ok' });
  } catch (err) {
    console.error('Webhook Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to process webhook', 500);
  }
}
