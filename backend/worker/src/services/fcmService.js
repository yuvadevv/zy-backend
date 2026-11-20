import { SignJWT, importPKCS8 } from 'jose';

/**
 * Enterprise Firebase Cloud Messaging (FCM) v1 Service for BLINTZY
 * Supports:
 * - Google Cloud OAuth2 Service Account Token Minting (zero external firebase-admin dependency)
 * - FCM v1 HTTP REST API delivery
 * - Dev/Sandbox Mock Delivery Mode (when credentials are not yet added to .env)
 * - Automatic token invalidation cleanup (UNREGISTERED, INVALID_ARGUMENT)
 * - Asynchronous chunked batch distribution with controlled concurrency
 */

let cachedAccessToken = null;
let tokenExpiryTime = 0;

/**
 * Generate OAuth2 Access Token for FCM v1 using Service Account JSON or credentials
 */
async function getFcmAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < tokenExpiryTime - 60) {
    return cachedAccessToken;
  }

  let serviceAccount = null;

  // 1. Check raw JSON env variable
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT_KEY === 'string'
        ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : env.FIREBASE_SERVICE_ACCOUNT_KEY;
    } catch (e) {
      console.warn('[FCM] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  // 2. Check individual fields
  if (!serviceAccount && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      client_email: env.FIREBASE_CLIENT_EMAIL,
      private_key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      project_id: env.FIREBASE_PROJECT_ID
    };
  }

  if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
    return null; // Signals sandbox/mock mode
  }

  try {
    const formattedKey = serviceAccount.private_key.replace(/\\n/g, '\n');
    const privateKey = await importPKCS8(formattedKey, 'RS256');

    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging'
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(serviceAccount.client_email)
      .setSubject(serviceAccount.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[FCM] Failed to exchange JWT for Google access token:', errText);
      return null;
    }

    const data = await tokenRes.json();
    cachedAccessToken = data.access_token;
    tokenExpiryTime = now + (data.expires_in || 3600);
    return cachedAccessToken;
  } catch (err) {
    console.error('[FCM] Error generating access token:', err);
    return null;
  }
}

/**
 * Deliver a single FCM v1 push notification
 */
export async function sendFcmNotification(env, { token, title, body, imageUrl, actionUrl, data = {} }) {
  if (!token) return { success: false, error: 'MISSING_TOKEN' };

  // Simulated / Mock token handling for testing
  if (token.startsWith('mock_token_') || token.startsWith('test_token_')) {
    if (token.includes('invalid') || token.includes('expired')) {
      return { success: false, error: 'UNREGISTERED', shouldDeactivate: true };
    }
    return { success: true, messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` };
  }

  const projectId = env.FIREBASE_PROJECT_ID || 'blintzy-campus';
  const accessToken = await getFcmAccessToken(env);

  // If no production credentials provided, fallback to Sandbox logger
  if (!accessToken) {
    console.log(`[FCM Sandbox Mock] Sent push to token: ${token.slice(0, 15)}... | Title: "${title}" | Body: "${body}"`);
    return { success: true, messageId: `sandbox_${Date.now()}`, mode: 'sandbox' };
  }

  const payload = {
    message: {
      token,
      notification: {
        title,
        body,
        ...(imageUrl ? { image: imageUrl } : {})
      },
      data: {
        click_action: actionUrl || '/app',
        url: actionUrl || '/app',
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
        )
      },
      webpush: {
        fcm_options: {
          link: actionUrl || '/app'
        },
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          vibrate: [200, 100, 200],
          requireInteraction: false
        }
      }
    }
  };

  try {
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      }
    );

    if (fcmRes.ok) {
      const respData = await fcmRes.json();
      return { success: true, messageId: respData.name };
    }

    const errData = await fcmRes.json().catch(() => ({}));
    const errorCode = errData?.error?.details?.[0]?.errorCode || errData?.error?.status || 'UNKNOWN';

    // Check if token is permanently dead
    const shouldDeactivate = 
      errorCode === 'UNREGISTERED' || 
      errorCode === 'INVALID_ARGUMENT' || 
      errData?.error?.message?.includes('registration token is not valid');

    return {
      success: false,
      error: errorCode,
      message: errData?.error?.message,
      shouldDeactivate
    };
  } catch (netErr) {
    return { success: false, error: 'NETWORK_ERROR', message: netErr.message };
  }
}

/**
 * High-Throughput Batch Broadcast Dispatcher
 * Dispatches messages to a list of subscriptions with controlled concurrency (e.g. 50 parallel)
 * Cleans up dead tokens in DB automatically.
 */
export async function broadcastToSubscriptions(env, { campaignId, subscriptions, title, message, imageUrl, actionUrl, data }) {
  if (!subscriptions || subscriptions.length === 0) {
    return { targetCount: 0, sentCount: 0, failedCount: 0, deactivatedTokens: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;
  let deactivatedTokens = 0;
  const deadTokenIds = [];
  const logInserts = [];
  const now = Date.now();

  const BATCH_SIZE = 50;
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const chunk = subscriptions.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      chunk.map(async (sub) => {
        const res = await sendFcmNotification(env, {
          token: sub.fcm_token,
          title,
          body: message,
          imageUrl,
          actionUrl,
          data
        });

        if (res.success) {
          return { status: 'sent', subId: sub.id, studentId: sub.student_id };
        } else {
          return {
            status: 'failed',
            subId: sub.id,
            studentId: sub.student_id,
            error: res.error,
            shouldDeactivate: res.shouldDeactivate
          };
        }
      })
    );

    for (const r of results) {
      if (r.status === 'sent') {
        sentCount++;
        logInserts.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          campaignId,
          subscriptionId: r.subId,
          studentId: r.studentId,
          status: 'sent',
          errorCode: null
        });
      } else {
        failedCount++;
        if (r.shouldDeactivate) {
          deadTokenIds.push(r.subId);
          deactivatedTokens++;
        }
        logInserts.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          campaignId,
          subscriptionId: r.subId,
          studentId: r.studentId,
          status: r.shouldDeactivate ? 'invalid_token' : 'failed',
          errorCode: r.error || 'FAILED'
        });
      }
    }
  }

  // 1. Batch cleanup invalid tokens
  if (deadTokenIds.length > 0) {
    try {
      const placeholders = deadTokenIds.map(() => '?').join(',');
      await env.DB.prepare(
        `UPDATE push_subscriptions SET is_active = 0, updated_at = ? WHERE id IN (${placeholders})`
      ).bind(now, ...deadTokenIds).run();
      console.log(`[FCM Cleanup] Deactivated ${deadTokenIds.length} invalid push tokens.`);
    } catch (e) {
      console.error('[FCM Cleanup] Error deactivating dead tokens:', e);
    }
  }

  // 2. Batch write delivery logs (up to 200 logs max for database performance)
  if (logInserts.length > 0) {
    try {
      const topLogs = logInserts.slice(0, 100);
      for (const log of topLogs) {
        await env.DB.prepare(`
          INSERT INTO push_delivery_logs (id, campaign_id, subscription_id, student_id, status, error_code, delivered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(log.id, log.campaignId || null, log.subscriptionId, log.studentId, log.status, log.errorCode, now).run();
      }
    } catch (e) {
      console.warn('[FCM Logs] Skipped detailed log insert:', e.message);
    }
  }

  // 3. Update campaign metrics if campaignId is present
  if (campaignId) {
    try {
      const finalStatus = failedCount === 0 ? 'completed' : (sentCount > 0 ? 'partially_failed' : 'failed');
      await env.DB.prepare(`
        UPDATE push_campaigns 
        SET sent_count = sent_count + ?, failed_count = failed_count + ?, status = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(sentCount, failedCount, finalStatus, now, now, campaignId).run();
    } catch (e) {
      console.error('[FCM Campaign Update] Error:', e);
    }
  }

  return {
    targetCount: subscriptions.length,
    sentCount,
    failedCount,
    deactivatedTokens
  };
}
