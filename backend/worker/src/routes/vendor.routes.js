import { Router } from '../core/Router.js';
import { verifyVendorAuth } from '../middleware/vendorAuth.js';
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
  handleVendorOrdersImportCommit,
  handleVendorPasswordChanged
} from './vendor.js';

export const vendorRouter = new Router();

// Middleware: Authenticate Vendor & inject context
vendorRouter.use(async (request, env, context) => {
  const vendorAuthResult = await verifyVendorAuth(request, env);
  if (vendorAuthResult.error) return vendorAuthResult.error;
  context.vendor = vendorAuthResult.context.vendor;
  context.vendorId = vendorAuthResult.context.vendorId;
});

// Dashboard
vendorRouter.get('/dashboard', handleVendorGetDashboard);

// Orders
vendorRouter.get('/orders/export', handleVendorOrdersExport);
vendorRouter.post('/orders/import/validate', handleVendorOrdersImportValidate);
vendorRouter.post('/orders/import/commit', handleVendorOrdersImportCommit);
vendorRouter.patch('/orders/bulk', handleVendorBulkPatchOrders);
vendorRouter.get('/orders/batches', handleVendorGetCommonManualBatches);
vendorRouter.get('/orders/:id', (req, env, ctx) => handleVendorGetOrder(req, env, ctx, ctx.params.id));
vendorRouter.patch('/orders/:id/status', (req, env, ctx) => handleVendorPatchOrderStatus(req, env, ctx, ctx.params.id));
vendorRouter.get('/orders', handleVendorGetOrders);

// Documents & Profile
vendorRouter.get('/documents/:id/access', (req, env, ctx) => handleVendorGetDocumentAccess(req, env, ctx, ctx.params.id));
vendorRouter.post('/profile/password-changed', handleVendorPasswordChanged);
