import { errorResponse, successResponse } from '../utils/response.js';
import { 
  getPayments, getVendors, getAuditLogs, getAnalytics, 
  getContent, createContent, updateContent, deleteContent, getExports, getPublicStatus
} from '../services/adminService.js';

export async function handleAdminGetPayments(request, env) {
  const url = new URL(request.url);
  return successResponse(await getPayments(env.DB, { 
    search: url.searchParams.get('search'), status: url.searchParams.get('status'),
    page: parseInt(url.searchParams.get('page') || '1'), limit: parseInt(url.searchParams.get('limit') || '25')
  }));
}

export async function handleAdminGetVendors(request, env) {
  const url = new URL(request.url);
  return successResponse(await getVendors(env.DB, { 
    search: url.searchParams.get('search'), status: url.searchParams.get('status'),
    page: parseInt(url.searchParams.get('page') || '1'), limit: parseInt(url.searchParams.get('limit') || '25')
  }));
}

export async function handleAdminGetAuditLogs(request, env) {
  const url = new URL(request.url);
  return successResponse(await getAuditLogs(env.DB, { 
    actor: url.searchParams.get('actor'), action: url.searchParams.get('action'),
    page: parseInt(url.searchParams.get('page') || '1'), limit: parseInt(url.searchParams.get('limit') || '25')
  }));
}

export async function handleAdminGetAnalytics(request, env) {
  return successResponse(await getAnalytics(env.DB));
}

export async function handleAdminGetContent(request, env) {
  return successResponse(await getContent(env.DB));
}

// Normalize frontend flat-shape to DB schema shape
function normalizeContentBody(body) {
  // If already using DB shape, pass through
  if (body.content_type) return body;
  // Convert from frontend flat shape to DB shape
  const metadata = {};
  if (body.link_url)   metadata.url = body.link_url;
  if (body.image_url)  metadata.image_key = body.image_url;
  if (body.description) metadata.subtitle = body.description;
  if (body.cta_label)  metadata.cta = body.cta_label;
  if (body.theme) metadata.theme = body.theme;
  if (body.icon) metadata.icon = body.icon;
  return {
    content_type: body.type || 'banner',
    title: body.title,
    metadata,
    priority: body.priority ?? 0,
    status: body.is_active ? 'active' : 'inactive',
    start_time: body.start_time || null,
    end_time: body.end_time || null
  };
}

export async function handleAdminPostContent(request, env, context) {
  const body = await request.json();
  const res = await createContent(env.DB, normalizeContentBody(body), context.admin.id);
  return successResponse(res);
}

export async function handleAdminPatchContent(request, env, context, id) {
  const body = await request.json();
  const res = await updateContent(env.DB, id, normalizeContentBody(body), context.admin.id);
  return successResponse(res);
}

export async function handleAdminDeleteContent(request, env, context, id) {
  const res = await deleteContent(env.DB, id, context.admin.id);
  return successResponse(res);
}

export async function handleAdminGetExports(request, env, type) {
  const url = new URL(request.url);
  const params = {
    status: url.searchParams.get('status'),
    branch: url.searchParams.get('branch'),
    search: url.searchParams.get('search')
  };
  
  const csv = await getExports(env.DB, type, params);
  if (csv === null) return errorResponse('BAD_REQUEST', 'Invalid export type', 400);
  
  const headers = new Headers();
  headers.set('Content-Type', 'text/csv');
  headers.set('Content-Disposition', `attachment; filename="${type}_export.csv"`);
  return new Response(csv, { headers });
}

export async function handleAdminUploadContent(request, env, context) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('BAD_REQUEST', 'No file provided', 400);
  
  const key = `media/${crypto.randomUUID()}-${file.name}`;
  await env.PUBLIC_MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  });
  
  return successResponse({ success: true, key });
}

export async function handlePublicGetStatus(request, env) {
  return successResponse(await getPublicStatus(env.DB));
}

import { getOrders, getOrderDetails, updateAdminOrderStatus, updateAdminOrderVendor, getDashboardStats, getDocumentAccessMetadata, updateAdminOrdersBulk, getCommonManualBatches, validateImportOrders } from '../services/adminService.js';

export async function handleAdminGetOrders(request, env) {
  try {
    const url = new URL(request.url);
    const params = {
      status: url.searchParams.get('status') || 'all',
      search: url.searchParams.get('search') || '',
      page: parseInt(url.searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100),
      branch: url.searchParams.get('branch') || '',
      year: url.searchParams.get('year') || '',
      semester: url.searchParams.get('semester') || '',
      manual_id: url.searchParams.get('manual_id') || '',
      payment_status: url.searchParams.get('payment_status') || '',
      min_price: url.searchParams.get('min_price') || '',
      max_price: url.searchParams.get('max_price') || '',
      sort: url.searchParams.get('sort') || 'newest'
    };

    const result = await getOrders(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Admin Get Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch orders', 500);
  }
}

export async function handleAdminGetOrder(request, env, id) {
  try {
    const details = await getOrderDetails(env.DB, id);
    if (!details) {
      return errorResponse('NOT_FOUND', 'Order not found', 404);
    }
    return successResponse(details);
  } catch (err) {
    console.error('Admin Get Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch order details', 500);
  }
}

export async function handleAdminBulkPatchOrders(request, env, context) {
  try {
    const body = await request.json();
    const { orderIds, updates } = body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return errorResponse('BAD_REQUEST', 'orderIds array is required', 400);
    }

    const result = await updateAdminOrdersBulk(env.DB, orderIds, updates || {}, context.admin.id);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    return successResponse(result);
  } catch (err) {
    console.error('Admin Bulk Patch Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to bulk update orders', 500);
  }
}

export async function handleAdminPatchOrderStatus(request, env, context, id) {
  try {
    const body = await request.json();
    const { status, currentStatus } = body;
    
    if (!status || !currentStatus) {
      return errorResponse('BAD_REQUEST', 'Both status and currentStatus are required', 400);
    }

    const result = await updateAdminOrderStatus(env.DB, id, status, currentStatus, context.admin.id);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    return successResponse({ success: true, newStatus: status });
  } catch (err) {
    console.error('Admin Patch Order Status Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order status', 500);
  }
}

export async function handleAdminGetDashboard(request, env) {
  try {
    const stats = await getDashboardStats(env.DB);
    return successResponse(stats);
  } catch (err) {
    console.error('Admin Get Dashboard Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch dashboard stats', 500);
  }
}

export async function handleAdminPatchOrderVendor(request, env, context, id) {
  try {
    const body = await request.json();
    const { vendor_id } = body;
    
    if (!vendor_id) {
      return errorResponse('BAD_REQUEST', 'vendor_id is required', 400);
    }

    const adminId = context.admin.id;
    const result = await updateAdminOrderVendor(env.DB, id, vendor_id, adminId);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    return successResponse({ success: true, newVendorId: vendor_id });
  } catch (err) {
    console.error('Admin Patch Order Vendor Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order vendor', 500);
  }
}

export async function handleAdminGetDocumentAccess(request, env, documentId) {
  try {
    const metadata = await getDocumentAccessMetadata(env.DB, documentId);
    if (!metadata) {
      return errorResponse('NOT_FOUND', 'Document not found or deleted', 404);
    }

    // Stream the document securely from R2
    const object = await env.DOCUMENTS.get(metadata.r2_object_key);
    if (!object) {
      return errorResponse('NOT_FOUND', 'Document content not found in storage', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Disposition', `inline; filename="${metadata.original_filename}"`);
    headers.set('Content-Type', metadata.file_type || 'application/pdf');

    return new Response(object.body, { headers });
  } catch (err) {
    console.error('Admin Get Document Access Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to securely fetch document', 500);
  }
}

import { PaymentProvider } from "../services/paymentProvider.js";

export async function handleAdminGetPaymentGatewayStatus(request, env) {
  try {
    const provider = new PaymentProvider(env);
    const status = await provider.getStatus();
    return successResponse(status);
  } catch (err) {
    return errorResponse("SERVER_ERROR", "Failed to get payment gateway status", 500);
  }
}

export async function handleAdminPatchPaymentGateway(request, env, context) {
  try {
    const body = await request.json();
    const { provider, environment, enabled } = body;
    
    // Read current
    const current = await new PaymentProvider(env).getGatewaySettings();
    
    const nextConfig = {
      provider: provider || current.provider || "razorpay",
      environment: environment || current.environment || "test",
      enabled: typeof enabled === "boolean" ? enabled : current.enabled
    };
    
    await env.DB.prepare(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at) 
       VALUES ("payment_gateway", ?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET 
       setting_value = excluded.setting_value, 
       updated_by = excluded.updated_by, 
       updated_at = excluded.updated_at`
    ).bind(JSON.stringify(nextConfig), context.user.id, Date.now()).run();
    
    // Log audit
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      context.user.id,
      context.user.role || "ADMIN",
      "updated",
      "payment_gateway",
      "payment_gateway",
      JSON.stringify(current),
      JSON.stringify(nextConfig),
      Date.now()
    ).run();

    return successResponse(nextConfig);
  } catch (err) {
    return errorResponse("SERVER_ERROR", "Failed to update payment gateway", 500);
  }
}

export async function handleAdminTestPaymentGateway(request, env) {
  try {
    const provider = new PaymentProvider(env);
    const result = await provider.testConnection();
    return successResponse(result);
  } catch (err) {
    return errorResponse("SERVER_ERROR", "Failed to test connection", 500);
  }
}


export async function handleAdminGetCommonManualBatches(request, env) {
  try {
    const url = new URL(request.url);
    const params = {
      status: url.searchParams.get('status') || 'all'
    };
    const result = await getCommonManualBatches(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Admin Get Batches Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch common manual batches', 500);
  }
}

export async function handleAdminOrdersExport(request, env) {
  try {
    const url = new URL(request.url);
    const params = {
      status: url.searchParams.get('status') || 'all',
      search: url.searchParams.get('search') || '',
      limit: 'all', // Get all for export
      branch: url.searchParams.get('branch') || '',
      year: url.searchParams.get('year') || '',
      semester: url.searchParams.get('semester') || '',
      manual_id: url.searchParams.get('manual_id') || '',
      payment_status: url.searchParams.get('payment_status') || '',
      min_price: url.searchParams.get('min_price') || '',
      max_price: url.searchParams.get('max_price') || '',
      sort: url.searchParams.get('sort') || 'newest'
    };
    const result = await getOrders(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Admin Export Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to export orders', 500);
  }
}

export async function handleAdminOrdersImportValidate(request, env, context) {
  try {
    const body = await request.json();
    if (!body.rows || !Array.isArray(body.rows)) {
      return errorResponse('BAD_REQUEST', 'Missing rows array', 400);
    }
    const result = await validateImportOrders(env.DB, body.rows);
    return successResponse(result);
  } catch (err) {
    console.error('Admin Import Validate Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to validate import', 500);
  }
}

export async function handleAdminOrdersImportCommit(request, env, context) {
  try {
    const body = await request.json();
    if (!body.updates || !Array.isArray(body.updates)) {
      return errorResponse('BAD_REQUEST', 'Missing updates array', 400);
    }
    
    // updates is expected to be array of: { orderId: "BLZ-..", status: "...", estimatedDelivery: 1234, ... }
    // We execute them one by one or grouped. We'll reuse updateAdminOrdersBulk for each row essentially.
    
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailures = [];
    
    for (const update of body.updates) {
       const res = await updateAdminOrdersBulk(env.DB, [update.orderId], update, context.admin.id);
       if (res.error) {
         totalSkipped++;
         totalFailures.push({ orderId: update.orderId, reason: res.error });
       } else if (res.results) {
         totalUpdated += res.results.updated;
         totalSkipped += res.results.skipped;
         totalFailures = totalFailures.concat(res.results.failures);
       }
    }
    
    return successResponse({
      success: true,
      results: { updated: totalUpdated, skipped: totalSkipped, failures: totalFailures }
    });
  } catch (err) {
    console.error('Admin Import Commit Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to commit import', 500);
  }
}

