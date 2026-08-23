// paymentProvider.js
export class PaymentProvider {
  constructor(env) {
    this.env = env;
  }
  
  async getGatewaySettings() {
    const raw = await this.env.DB.prepare(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'payment_gateway'`
    ).first();
    let config = { provider: 'razorpay', environment: 'test', enabled: false };
    if (raw && raw.setting_value) {
      try {
        config = { ...config, ...JSON.parse(raw.setting_value) };
      } catch(e) {}
    }
    return config;
  }

  async getStatus() {
    const config = await this.getGatewaySettings();
    const keyId = this.env.RAZORPAY_KEY_ID;
    const keySecret = this.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = this.env.RAZORPAY_WEBHOOK_SECRET;

    return {
      provider: config.provider,
      environment: config.environment,
      enabled: config.enabled,
      configured: !!(keyId && keySecret),
      keyIdConfigured: !!keyId,
      keySecretConfigured: !!keySecret,
      webhookConfigured: !!webhookSecret,
      lastVerifiedAt: null // We could store this in platform_settings if needed
    };
  }
  
  async testConnection() {
    const keyId = this.env.RAZORPAY_KEY_ID;
    const keySecret = this.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return { success: false, code: 'NOT_CONFIGURED' };
    }
    
    try {
      const basicAuth = btoa(`${keyId}:${keySecret}`);
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`
        }
      });
      
      if (res.ok) {
        return { success: true, code: 'CONNECTED' };
      } else {
        return { success: false, code: 'CONNECTION_FAILED' };
      }
    } catch(err) {
      return { success: false, code: 'CONNECTION_FAILED', message: err.message };
    }
  }

  async createOrder(amount, currency, receiptId) {
    const keyId = this.env.RAZORPAY_KEY_ID;
    const keySecret = this.env.RAZORPAY_KEY_SECRET;
    
    if (!keyId || !keySecret) {
      throw new Error("Razorpay credentials not configured");
    }

    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency: currency,
        receipt: receiptId,
        payment_capture: 1
      })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Razorpay order creation failed:", errorText);
      throw new Error("Failed to create provider order");
    }
    
    const data = await res.json();
    return {
      id: data.id,
      amount: amount,
      currency: currency
    };
  }

  async verifySignature(orderId, paymentId, signature) {
    const keySecret = this.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new Error("Razorpay credentials not configured");
    }
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(keySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const data = encoder.encode(orderId + "|" + paymentId);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
    
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex === signature;
  }
  
  async verifyWebhookSignature(rawBody, signature) {
    const webhookSecret = this.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Webhook secret not configured");
    }
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex === signature;
  }
}
