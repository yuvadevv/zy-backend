import { errorResponse, successResponse } from '../utils/response.js';
import { getVendorDashboardStats, getVendorDocumentAccess } from '../services/vendorService.js';
import { getOrders, getOrderDetails, updateAdminOrdersBulk, updateAdminOrderStatus, getCommonManualBatches, validateImportOrders } from '../services/adminService.js';

export async function handleVendorGetOrders(request, env, context) {
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
      sort: url.searchParams.get('sort') || 'newest',
      vendor_id: context.vendor.id
    };

    const result = await getOrders(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Get Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor orders', 500);
  }
}

export async function handleVendorGetOrder(request, env, context, id) {
  try {
    const details = await getOrderDetails(env.DB, id, context.vendor.id);
    if (!details) {
      return errorResponse('NOT_FOUND', 'Order not found', 404);
    }
    return successResponse(details);
  } catch (err) {
    console.error('Vendor Get Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor order details', 500);
  }
}

export async function handleVendorBulkPatchOrders(request, env, context) {
  try {
    const body = await request.json();
    const { orderIds, updates } = body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return errorResponse('BAD_REQUEST', 'orderIds array is required', 400);
    }

    const result = await updateAdminOrdersBulk(env.DB, orderIds, updates || {}, context.vendor.id, context.vendor.id);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    return successResponse(result);
  } catch (err) {
    console.error('Vendor Bulk Patch Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to bulk update orders', 500);
  }
}

export async function handleVendorPatchOrderStatus(request, env, context, id) {
  try {
    const body = await request.json();
    const { status, currentStatus } = body;
    
    if (!status || !currentStatus) {
      return errorResponse('BAD_REQUEST', 'Both status and currentStatus are required', 400);
    }

    const result = await updateAdminOrderStatus(env.DB, id, status, currentStatus, context.vendor.id);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    return successResponse({ success: true, newStatus: status });
  } catch (err) {
    console.error('Vendor Patch Order Status Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order status', 500);
  }
}

export async function handleVendorGetCommonManualBatches(request, env, context) {
  try {
    const url = new URL(request.url);
    const params = {
      status: url.searchParams.get('status') || 'all',
      vendor_id: context.vendor.id
    };
    const result = await getCommonManualBatches(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Get Batches Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch common manual batches', 500);
  }
}

export async function handleVendorOrdersExport(request, env, context) {
  try {
    const url = new URL(request.url);
    const params = {
      status: url.searchParams.get('status') || 'all',
      search: url.searchParams.get('search') || '',
      limit: 'all',
      branch: url.searchParams.get('branch') || '',
      year: url.searchParams.get('year') || '',
      semester: url.searchParams.get('semester') || '',
      manual_id: url.searchParams.get('manual_id') || '',
      sort: url.searchParams.get('sort') || 'newest',
      vendor_id: context.vendor.id
    };
    const result = await getOrders(env.DB, params);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Export Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to export orders', 500);
  }
}

export async function handleVendorOrdersImportValidate(request, env, context) {
  try {
    const body = await request.json();
    if (!body.rows || !Array.isArray(body.rows)) {
      return errorResponse('BAD_REQUEST', 'Missing rows array', 400);
    }
    const result = await validateImportOrders(env.DB, body.rows, context.vendor.id);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Import Validate Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to validate import', 500);
  }
}

export async function handleVendorOrdersImportCommit(request, env, context) {
  try {
    const body = await request.json();
    if (!body.updates || !Array.isArray(body.updates)) {
      return errorResponse('BAD_REQUEST', 'Missing updates array', 400);
    }
    
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailures = [];
    
    for (const update of body.updates) {
       const res = await updateAdminOrdersBulk(env.DB, [update.orderId], update, context.vendor.id, context.vendor.id);
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
    console.error('Vendor Import Commit Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to commit import', 500);
  }
}

export async function handleVendorGetDashboard(request, env, context) {
  try {
    const vendorId = context.vendor.id;
    const stats = await getVendorDashboardStats(env.DB, vendorId);
    return successResponse(stats);
  } catch (err) {
    console.error('Vendor Get Dashboard Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor dashboard stats', 500);
  }
}

export async function handleVendorGetDocumentAccess(request, env, context, documentId) {
  try {
    const vendorId = context.vendor.id;
    const metadata = await getVendorDocumentAccess(env.DB, vendorId, documentId);
    if (!metadata) {
      return errorResponse('NOT_FOUND', 'Document not found, deleted, or unassigned to any order', 404);
    }

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
    console.error('Vendor Get Document Access Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to securely fetch document', 500);
  }
}
