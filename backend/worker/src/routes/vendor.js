import { errorResponse, successResponse } from '../utils/response.js';
import { getOrders, getOrderDetails, updateAdminOrdersBulk, updateAdminOrderStatus, getCommonManualBatches, validateImportOrders } from '../services/adminService.js';
import { getVendorDashboardStats, getVendorDocumentAccess, getVendorDocuments, getVendorActivity, getVendorProfile, updateVendorProfile, updateVendorOrderStatus } from '../services/vendorService.js';

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
      order_type: url.searchParams.get('order_type') || 'all',
      payment_status: url.searchParams.get('payment_status') || '',
      min_price: url.searchParams.get('min_price') || '',
      max_price: url.searchParams.get('max_price') || '',
      sort: url.searchParams.get('sort') || 'newest'
      // No vendor_id filter: all active vendors see the global order pool
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
    // Pass null as vendorId — all active vendors can view any order's details
    const details = await getOrderDetails(env.DB, id, null);
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

    // Bulk status updates are restricted to orders owned by this vendor
    const result = await updateAdminOrdersBulk(env.DB, orderIds, updates || {}, context.vendor.id, context.vendor.id);
    
    if (result.error) {
      return errorResponse('BAD_REQUEST', result.error, result.status);
    }

    if (updates.status === 'delivered') {
      try {
        for (const orderId of orderIds) {
          const internalIdResult = await env.DB.prepare('SELECT internal_id FROM orders WHERE public_id = ?').bind(orderId).first();
          if (internalIdResult) {
            const docs = await env.DB.prepare('SELECT id, r2_object_key FROM documents WHERE order_id = ? AND deleted_at IS NULL AND document_type IN (\'custom\', \'hall_ticket\')').bind(internalIdResult.internal_id).all();
            if (docs && docs.results && docs.results.length > 0) {
              for (const doc of docs.results) {
                await env.DOCUMENTS.delete(doc.r2_object_key);
                await env.DB.prepare('UPDATE documents SET deleted_at = ? WHERE id = ?').bind(Date.now(), doc.id).run();
              }
            }
          }
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup documents on bulk delivery', cleanupErr);
      }
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

    // Use vendor-specific update which handles:
    // 1. Atomic claiming (received -> accepted with vendor_id IS NULL atomic check)
    // 2. Ownership verification for subsequent transitions  
    // 3. Proper 409 conflict error for concurrent claims
    // 4. 403 if vendor B tries to mutate vendor A's order
    const result = await updateVendorOrderStatus(env.DB, context.vendor.id, id, status, currentStatus);
    
    if (result.error) {
      const httpStatus = result.status || 400;
      const code = httpStatus === 403 ? 'FORBIDDEN' : httpStatus === 409 ? 'CONFLICT' : 'BAD_REQUEST';
      return errorResponse(code, result.error, httpStatus);
    }

    if (status === 'delivered') {
      try {
        const internalIdResult = await env.DB.prepare('SELECT internal_id FROM orders WHERE public_id = ?').bind(id).first();
        if (internalIdResult) {
          const docs = await env.DB.prepare('SELECT id, r2_object_key FROM documents WHERE order_id = ? AND deleted_at IS NULL AND document_type IN (\'custom\', \'hall_ticket\')').bind(internalIdResult.internal_id).all();
          if (docs && docs.results && docs.results.length > 0) {
            for (const doc of docs.results) {
              await env.DOCUMENTS.delete(doc.r2_object_key);
              await env.DB.prepare('UPDATE documents SET deleted_at = ? WHERE id = ?').bind(Date.now(), doc.id).run();
            }
          }
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup documents on delivery', cleanupErr);
      }
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
      order_type: url.searchParams.get('order_type') || 'all',
      sort: url.searchParams.get('sort') || 'newest'
      // Global export - no vendor_id restriction
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
      return errorResponse('NOT_FOUND', 'Document not found, deleted, or not associated with any operational order', 404);
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

export async function handleVendorPasswordChanged(request, env, context) {
  try {
    const vendorId = context.vendor.id;
    await env.DB.prepare(`UPDATE vendors SET password_change_required = 0 WHERE id = ?`).bind(vendorId).run();
    return successResponse({ success: true });
  } catch (err) {
    console.error('Vendor Password Changed Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update password change status', 500);
  }
}

export async function handleVendorGetDocuments(request, env, context) {
  try {
    const url = new URL(request.url);
    const params = {
      search: url.searchParams.get('search') || '',
      page: parseInt(url.searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
    };
    const result = await getVendorDocuments(env.DB, context.vendor.id, params);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Get Documents Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor documents', 500);
  }
}

export async function handleVendorGetActivity(request, env, context) {
  try {
    const url = new URL(request.url);
    const params = {
      page: parseInt(url.searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
    };
    const result = await getVendorActivity(env.DB, context.vendor.id, params);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Get Activity Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor activity', 500);
  }
}

export async function handleVendorGetProfile(request, env, context) {
  try {
    const profile = await getVendorProfile(env.DB, context.vendor.id);
    if (!profile) return errorResponse('NOT_FOUND', 'Vendor profile not found', 404);
    return successResponse(profile);
  } catch (err) {
    console.error('Vendor Get Profile Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor profile', 500);
  }
}

export async function handleVendorPatchProfile(request, env, context) {
  try {
    const body = await request.json();
    const result = await updateVendorProfile(env.DB, context.vendor.id, body);
    return successResponse(result);
  } catch (err) {
    console.error('Vendor Patch Profile Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update vendor profile', 500);
  }
}
