import { errorResponse, successResponse } from '../utils/response.js';
import { createPayment, getPaymentByOrderId, verifyDevelopmentPayment, markPaymentPaid } from '../services/paymentService.js';
import { PaymentProvider } from '../services/paymentProvider.js';

export async function handleCreatePayment(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return errorResponse('BAD_REQUEST', 'orderId is required', 400);
    }

    // 1. Verify order ownership
    const order = await env.DB.prepare(`
      SELECT internal_id, grand_total 
      FROM orders 
      WHERE public_id = ? AND student_id = ?
    `).bind(orderId, studentId).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'Order not found', 404);
    }

    if (order.grand_total < 1) {
      return errorResponse('BAD_REQUEST', 'Invalid order total', 400);
    }

    // 2. Check Gateway Configuration
    const provider = new PaymentProvider(env);
    const config = await provider.getGatewaySettings();

    if (!config.enabled) {
      return errorResponse('FORBIDDEN', 'Payment gateway is currently disabled', 403);
    }

    // 3. Check for existing payment
    const existingPayment = await getPaymentByOrderId(env.DB, order.internal_id);
    if (existingPayment) {
      if (existingPayment.status === 'paid') {
        return errorResponse('CONFLICT', 'Order is already paid', 409);
      }
      if (existingPayment.status === 'pending' && existingPayment.provider === config.provider) {
        return successResponse({
          providerOrderId: existingPayment.provider_order_id,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          keyId: env.RAZORPAY_KEY_ID
        });
      }
    }

    let providerOrderId;
    let paymentCurrency = 'INR';

    // 4. Development Mock Mode Fallback Check
    const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';

    if (isDevMock) {
      providerOrderId = `mock_order_${order.internal_id}_${Date.now()}`;
    } else {
      // 5. Create real Razorpay order
      const receiptId = `rcpt_${order.internal_id.substring(0, 10)}`;
      try {
        const gwOrder = await provider.createOrder(order.grand_total, paymentCurrency, receiptId);
        providerOrderId = gwOrder.id;
      } catch (err) {
        return errorResponse('SERVER_ERROR', 'Failed to initialize payment gateway', 500);
      }
    }

    // 6. Record payment intent
    const payment = await createPayment(env.DB, {
      order_id: order.internal_id,
      provider: isDevMock ? 'mock' : config.provider,
      provider_order_id: providerOrderId,
      amount: order.grand_total,
      currency: paymentCurrency
    });

    return successResponse({
      providerOrderId: payment.provider_order_id,
      amount: payment.amount,
      currency: payment.currency,
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

    // Find the payment intent
    const payment = await env.DB.prepare(`
      SELECT * FROM payments WHERE provider_order_id = ?
    `).bind(providerOrderId).first();

    if (!payment) {
      return errorResponse('BAD_REQUEST', 'Invalid payment session', 400);
    }

    if (payment.status === 'paid') {
      return successResponse({ status: 'paid' });
    }

    // Verify the order ownership
    const order = await env.DB.prepare(`
      SELECT * FROM orders WHERE internal_id = ? AND student_id = ?
    `).bind(payment.order_id, studentId).first();

    if (!order) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    // Development Mock Verification
    const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';
    if (payment.provider === 'mock') {
      if (!isDevMock) {
        return errorResponse('FORBIDDEN', 'Mock payments not permitted in this environment', 403);
      }
    } else {
      // Real Signature Verification
      if (!providerSignature) {
        return errorResponse('BAD_REQUEST', 'Missing signature', 400);
      }
      const provider = new PaymentProvider(env);
      const isValid = await provider.verifySignature(providerOrderId, providerPaymentId, providerSignature);
      if (!isValid) {
        return errorResponse('BAD_REQUEST', 'Invalid payment signature', 400);
      }
    }

    // Mark payment as paid
    // Update markPaymentPaid in service if it doesn't take signature
    await env.DB.prepare(`
      UPDATE payments SET status = 'paid', provider_payment_id = ?, provider_signature = ?, paid_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(providerPaymentId, providerSignature || null, Date.now(), Date.now(), payment.id).run();

    // Update order status to printing if currently received
    if (order.status === 'received' || order.status === 'pending') {
      await env.DB.prepare(`
        UPDATE orders 
        SET status = 'printing', updated_at = ?
        WHERE internal_id = ?
      `).bind(Date.now(), order.internal_id).run();
    }

    return successResponse({
      status: 'paid',
      orderId: order.public_id
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
          if (order && (order.status === 'received' || order.status === 'pending')) {
            await env.DB.prepare(`UPDATE orders SET status = 'printing', updated_at = ? WHERE internal_id = ?`).bind(Date.now(), order.internal_id).run();
          }
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
