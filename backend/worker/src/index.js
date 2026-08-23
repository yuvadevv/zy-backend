import { handleHealth } from './routes/health.js';
import { handleGetMe, handlePutMe } from './routes/students.js';
import { handleGetFilters, handleGetManuals, handleGetManualById, handleGetManualPreview } from './routes/manuals.js';
import { handleTestPdf } from './routes/test-pdf.js';
import { handleGetContent, handleGetPlatformStatus } from './routes/public.js';
import { verifyAuth } from './middleware/auth.js';
import { errorResponse } from './utils/response.js';
import { handlePostDocument, handleGetDocument, handleDeleteDocument } from './routes/documents.js';
import { handlePostOrder, handleGetOrders, handleGetOrder } from './routes/orders.js';
import { handleCreatePayment, handleVerifyPayment, handlePaymentWebhook } from './routes/payments.js';
import { verifyAdminAuth, requirePermission } from './middleware/adminAuth.js';
import { verifyVendorAuth } from './middleware/vendorAuth.js';
import {
  handleAdminGetOrders,
  handleAdminGetOrder,
  handleAdminPatchOrderStatus,
  handleAdminBulkPatchOrders,
  handleAdminPatchOrderVendor,
  handleAdminGetDashboard,
  handleAdminGetDocumentAccess,
  handleAdminGetCommonManualBatches,
  handleAdminOrdersExport,
  handleAdminOrdersImportValidate,
  handleAdminOrdersImportCommit,
  handleAdminGetPayments, handleAdminGetVendors, handleAdminGetAuditLogs, handleAdminGetAnalytics,
  handleAdminGetContent, handleAdminPostContent, handleAdminPatchContent, handleAdminDeleteContent,
  handleAdminGetExports, handleAdminUploadContent, handlePublicGetStatus,
  handleAdminGetPaymentGatewayStatus, handleAdminPatchPaymentGateway, handleAdminTestPaymentGateway
} from './routes/admin.js';
import { handleGetRoles, handleGetPermissions } from './routes/admin/roles.js';
import { handleGetTeam, handlePostTeamMember } from './routes/admin/team.js';
import { handleGetUsers, handlePatchUserStatus } from './routes/admin/users.js';
import { handleGetBranches, handlePostBranch, handlePatchBranch, handleGetSubjects, handlePostSubject } from './routes/admin/academic.js';
import { handleGetManuals as handleAdminGetManuals, handlePostManual, handlePatchManual, handleDeleteManual, handlePostManualPreview } from './routes/admin/manuals.js';
import { handleGetSettings, handlePatchSettings } from './routes/admin/settings.js';
import {
  handleVendorGetOrders,
  handleVendorGetOrder,
  handleVendorPatchOrderStatus,
  handleVendorGetDashboard,
  handleVendorGetDocumentAccess,
  handleVendorBulkPatchOrders,
  handleVendorGetCommonManualBatches,
  handleVendorOrdersExport,
  handleVendorOrdersImportValidate,
  handleVendorOrdersImportCommit
} from './routes/vendor.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    let response;

    // Handle Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // Public endpoints
      if (request.method === 'GET' && path === '/api/health') {
        response = handleHealth();
      } else if (request.method === 'GET' && path === '/api/platform/status') {
        response = await handleGetPlatformStatus(request, env);
      } else if (request.method === 'GET' && path === '/api/content') {
        response = await handleGetContent(request, env);
      } else if (request.method === 'POST' && path === '/api/test-pdf') {
        return await handleTestPdf(request);
      } else if (request.method === 'GET' && path === '/api/manuals/filters') {
        response = await handleGetFilters(request, env);
      } else if (request.method === 'GET' && path === '/api/manuals') {
        response = await handleGetManuals(request, env);
      } else if (request.method === 'GET' && path.match(/^\/api\/manuals\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleGetManualById(request, env, id);
      } else if (request.method === 'POST' && path === '/api/payments/webhook') {
        return await handlePaymentWebhook(request, env);
      } else if (request.method === 'GET' && path.startsWith('/api/public/media/')) {
        const key = decodeURIComponent(path.replace('/api/public/', ''));
        const object = await env.PUBLIC_MEDIA.get(key);
        if (!object) return errorResponse('NOT_FOUND', 'Media not found', 404);
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        return new Response(object.body, { headers });
      } else if (path.startsWith('/api/admin/')) {
        // Admin Protected Endpoints
        const adminAuthResult = await verifyAdminAuth(request, env);
        if (adminAuthResult.error) {
          response = adminAuthResult.error;
        } else {
          const context = adminAuthResult.context;

          const check = async (perm) => {
            const res = await requirePermission(perm)(request, env, context);
            return res.error || null;
          };

          if (request.method === 'GET' && path === '/api/admin/dashboard') {
            response = await check('dashboard.view') || await handleAdminGetDashboard(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/orders') {
            response = await check('orders.view') || await handleAdminGetOrders(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/orders/export') {
            response = await check('orders.view') || await handleAdminOrdersExport(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/orders/import/validate') {
            response = await check('orders.edit') || await handleAdminOrdersImportValidate(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/orders/import/commit') {
            response = await check('orders.edit') || await handleAdminOrdersImportCommit(request, env, context);
          } else if (request.method === 'PATCH' && path === '/api/admin/orders/bulk') {
            response = await check('orders.edit') || await handleAdminBulkPatchOrders(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/orders/batches') {
            response = await check('orders.view') || await handleAdminGetCommonManualBatches(request, env, context);
          } else if (request.method === 'GET' && path.match(/^\/api\/admin\/orders\/[^/]+$/)) {
            const id = path.split('/')[4];
            response = await check('orders.view') || await handleAdminGetOrder(request, env, id);
          } else if (
            request.method === 'PATCH' &&
            path.match(/^\/api\/admin\/orders\/[^/]+\/status$/)
          ) {
            const id = path.split('/')[4];
            response = await check('orders.edit') || await handleAdminPatchOrderStatus(request, env, context, id);
          } else if (
            request.method === 'PATCH' &&
            path.match(/^\/api\/admin\/orders\/[^/]+\/vendor$/)
          ) {
            const id = path.split('/')[4];
            response = await check('orders.assign') || await handleAdminPatchOrderVendor(request, env, id);
          } else if (
            request.method === 'GET' &&
            path.match(/^\/api\/admin\/documents\/[^/]+\/access$/)
          ) {
            const id = path.split('/')[4];
            const err = await check('orders.view');
            if (err) return err;
            return await handleAdminGetDocumentAccess(request, env, id);
          } else if (request.method === 'GET' && path === '/api/admin/roles') {
            response = await check('users.view') || await handleGetRoles(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/permissions') {
            response = await check('users.view') || await handleGetPermissions(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/team') {
            response = await check('users.view') || await handleGetTeam(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/team') {
            response = await check('users.edit') || await handlePostTeamMember(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/users') {
            response = await check('users.view') || await handleGetUsers(request, env, context);
          } else if (request.method === 'PATCH' && path.match(/^\/api\/admin\/users\/[^/]+\/status$/)) {
            const id = path.split('/')[4];
            response = await check('users.edit') || await handlePatchUserStatus(request, env, context, id);
          } else if (request.method === 'GET' && path === '/api/admin/academic/branches') {
            response = await check('catalog.view') || await handleGetBranches(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/academic/branches') {
            response = await check('catalog.edit') || await handlePostBranch(request, env, context);
          } else if (request.method === 'PATCH' && path.match(/^\/api\/admin\/academic\/branches\/[^/]+$/)) {
            const id = path.split('/')[5];
            response = await check('catalog.edit') || await handlePatchBranch(request, env, context, id);
          } else if (request.method === 'GET' && path === '/api/admin/academic/subjects') {
            response = await check('catalog.view') || await handleGetSubjects(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/academic/subjects') {
            response = await check('catalog.edit') || await handlePostSubject(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/manuals') {
            response = await check('catalog.view') || await handleAdminGetManuals(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/manuals') {
            response = await check('catalog.edit') || await handlePostManual(request, env, context);
          } else if (request.method === 'PATCH' && path.match(/^\/api\/admin\/manuals\/[^/]+$/)) {
            const id = path.split('/')[4];
            response = await check('catalog.edit') || await handlePatchManual(request, env, context, id);
          } else if (request.method === 'DELETE' && path.match(/^\/api\/admin\/manuals\/[^/]+$/)) {
            const id = path.split('/')[4];
            response = await check('catalog.edit') || await handleDeleteManual(request, env, context, id);
          } else if (request.method === 'POST' && path.match(/^\/api\/admin\/manuals\/[^/]+\/preview-upload$/)) {
            const id = path.split('/')[4];
            response = await check('catalog.edit') || await handlePostManualPreview(request, env, context, id);
          } else if (request.method === 'GET' && path === '/api/admin/settings') {
            response = await check('settings.view') || await handleGetSettings(request, env, context);
          } else if (request.method === 'PATCH' && path === '/api/admin/settings') {
            response = await check('settings.edit') || await handlePatchSettings(request, env, context);
          } else if (request.method === 'GET' && path === '/api/admin/payment-gateway/status') {
            response = await check('payments.view') || await handleAdminGetPaymentGatewayStatus(request, env);
          } else if (request.method === 'PATCH' && path === '/api/admin/payment-gateway') {
            response = await check('payments.edit') || await handleAdminPatchPaymentGateway(request, env, context);
          } else if (request.method === 'POST' && path === '/api/admin/payment-gateway/test') {
            response = await check('payments.edit') || await handleAdminTestPaymentGateway(request, env);
          } else if (request.method === 'GET' && path === '/api/admin/payments') {
            response = await check('payments.view') || await handleAdminGetPayments(request, env);
          } else if (request.method === 'GET' && path === '/api/admin/vendors') {
            response = await check('vendors.view') || await handleAdminGetVendors(request, env);
          } else if (request.method === 'GET' && path === '/api/admin/audit') {
            response = await check('audit.view') || await handleAdminGetAuditLogs(request, env);
          } else if (request.method === 'GET' && path === '/api/admin/analytics') {
            response = await check('analytics.view') || await handleAdminGetAnalytics(request, env);
          } else if (request.method === 'GET' && path === '/api/admin/content') {
            response = await check('content.view') || await handleAdminGetContent(request, env);
          } else if (request.method === 'POST' && path === '/api/admin/content') {
            response = await check('content.edit') || await handleAdminPostContent(request, env, context);
          } else if (request.method === 'PATCH' && path.match(/^\/api\/admin\/content\/[^/]+$/)) {
            response = await check('content.edit') || await handleAdminPatchContent(request, env, context, path.split('/')[4]);
          } else if (request.method === 'DELETE' && path.match(/^\/api\/admin\/content\/[^/]+$/)) {
            response = await check('content.edit') || await handleAdminDeleteContent(request, env, context, path.split('/')[4]);
          } else if (request.method === 'GET' && path.match(/^\/api\/admin\/exports\/[^/]+$/)) {
            const type = path.split('/')[4];
            const err = await check(`exports.${type}`);
            if (err) return err;
            return await handleAdminGetExports(request, env, type);
          } else if (request.method === 'POST' && path === '/api/admin/content/upload') {
            response = await check('content.upload') || await handleAdminUploadContent(request, env, context);
          } else {
            response = errorResponse('NOT_FOUND', 'Admin route not found', 404);
          }
        }
      } else if (path.startsWith('/api/vendor/')) {
        // Vendor Protected Endpoints
        const vendorAuthResult = await verifyVendorAuth(request, env);
        if (vendorAuthResult.error) {
          response = vendorAuthResult.error;
        } else {
          const context = vendorAuthResult.context;

          if (request.method === 'GET' && path === '/api/vendor/dashboard') {
            response = await handleVendorGetDashboard(request, env, context);
          } else if (request.method === 'GET' && path === '/api/vendor/orders') {
            response = await handleVendorGetOrders(request, env, context);
          } else if (request.method === 'GET' && path === '/api/vendor/orders/export') {
            response = await handleVendorOrdersExport(request, env, context);
          } else if (request.method === 'POST' && path === '/api/vendor/orders/import/validate') {
            response = await handleVendorOrdersImportValidate(request, env, context);
          } else if (request.method === 'POST' && path === '/api/vendor/orders/import/commit') {
            response = await handleVendorOrdersImportCommit(request, env, context);
          } else if (request.method === 'PATCH' && path === '/api/vendor/orders/bulk') {
            response = await handleVendorBulkPatchOrders(request, env, context);
          } else if (request.method === 'GET' && path === '/api/vendor/orders/batches') {
            response = await handleVendorGetCommonManualBatches(request, env, context);
          } else if (request.method === 'GET' && path.match(/^\/api\/vendor\/orders\/[^/]+$/)) {
            const id = path.split('/')[4];
            response = await handleVendorGetOrder(request, env, context, id);
          } else if (
            request.method === 'PATCH' &&
            path.match(/^\/api\/vendor\/orders\/[^/]+\/status$/)
          ) {
            const id = path.split('/')[4];
            response = await handleVendorPatchOrderStatus(request, env, context, id);
          } else if (
            request.method === 'GET' &&
            path.match(/^\/api\/vendor\/documents\/[^/]+\/access$/)
          ) {
            const id = path.split('/')[4];
            return await handleVendorGetDocumentAccess(request, env, context, id); // Returns raw Response
          } else {
            response = errorResponse('NOT_FOUND', 'Vendor route not found', 404);
          }
        }
      } else {
        // Protected endpoints
        const authResult = await verifyAuth(request, env);
        if (authResult.error) {
          response = authResult.error;
        } else {
          const context = authResult.context;

          if (request.method === 'GET' && path === '/api/students/me') {
            response = await handleGetMe(request, env, context);
          } else if (request.method === 'PUT' && path === '/api/students/me') {
            response = await handlePutMe(request, env, context);
          } else if (request.method === 'POST' && path === '/api/documents') {
            response = await handlePostDocument(request, env, context);
          } else if (request.method === 'GET' && path.match(/^\/api\/documents\/[^/]+$/)) {
            const id = path.split('/')[3];
            response = await handleGetDocument(request, env, context, id);
          } else if (request.method === 'DELETE' && path.match(/^\/api\/documents\/[^/]+$/)) {
            const id = path.split('/')[3];
            response = await handleDeleteDocument(request, env, context, id);
          } else if (request.method === 'POST' && path === '/api/orders') {
            response = await handlePostOrder(request, env, context);
          } else if (request.method === 'GET' && path === '/api/orders') {
            response = await handleGetOrders(request, env, context);
          } else if (request.method === 'GET' && path.match(/^\/api\/orders\/[^/]+$/)) {
            const id = path.split('/')[3];
            response = await handleGetOrder(request, env, context, id);
          } else if (request.method === 'GET' && path.match(/^\/api\/manuals\/[^/]+\/preview$/)) {
            const id = path.split('/')[3];
            return await handleGetManualPreview(request, env, context, id);
          } else if (request.method === 'POST' && path === '/api/payments/create') {
            response = await handleCreatePayment(request, env, context);
          } else if (request.method === 'POST' && path === '/api/payments/verify') {
            response = await handleVerifyPayment(request, env, context);
          } else {
            response = errorResponse('NOT_FOUND', 'Route not found', 404);
          }
        }
      }
    } catch (err) {
      console.error('Unhandled worker error:', err);
      response = errorResponse('INTERNAL_ERROR', 'Internal server error', 500);
    }

    // Apply CORS
    const newHeaders = new Headers(response.headers);
    newHeaders.set(
      'Access-Control-Allow-Origin',
      request.headers.get('Origin') || '*'
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },

  async scheduled(event, env, ctx) {
    console.log('Cron trigger executed at', new Date().toISOString());
    const now = Date.now();

    try {
      const { results } = await env.DB.prepare(
        `
        SELECT id, r2_object_key FROM documents 
        WHERE expires_at <= ? AND deleted_at IS NULL
        LIMIT 100
      `
      )
        .bind(now)
        .all();

      console.log(`Found ${results.length} expired documents to clean up.`);

      for (const doc of results) {
        try {
          await env.DOCUMENTS.delete(doc.r2_object_key);
          await env.DB.prepare(
            `
            UPDATE documents SET deleted_at = ? WHERE id = ?
          `
          )
            .bind(now, doc.id)
            .run();
          console.log(`Successfully cleaned up document ${doc.id}`);
        } catch (e) {
          console.error(`Failed to clean up document ${doc.id}`, e);
        }
      }
    } catch (e) {
      console.error('Scheduled task failed to read expired documents', e);
    }
  },
};
