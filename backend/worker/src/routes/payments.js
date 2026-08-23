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

    if (order.grand_total <= 0) {
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

    // Idempotency: skip if already processed
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id; // Razorpay order id

      const payment = await env.DB.prepare(`
        SELECT * FROM payments WHERE provider_order_id = ?
      `).bind(orderId).first();

      if (payment && payment.status === 'pending') {
        // Mark payment as paid
        await env.DB.prepare(`
          UPDATE payments SET status = 'paid', provider_payment_id = ?, provider_signature = ?, paid_at = ?, updated_at = ?
          WHERE id = ?
        `).bind(paymentEntity.id, null, Date.now(), Date.now(), payment.id).run();
        
        // Update order status if needed
        const order = await env.DB.prepare(`SELECT * FROM orders WHERE internal_id = ?`).bind(payment.order_id).first();
        if (order && (order.status === 'received' || order.status === 'pending')) {
          await env.DB.prepare(`
            UPDATE orders SET status = 'printing', updated_at = ? WHERE internal_id = ?
          `).bind(Date.now(), order.internal_id).run();
        }
      }
    }

    return successResponse({ status: 'ok' });
  } catch (err) {
    console.error('Webhook Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to process webhook', 500);
  }
}
