import { Router } from '../core/Router.js';
import { verifyAdminAuth, requirePermission } from '../middleware/adminAuth.js';
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
  handleAdminGetExports, handleAdminUploadContent,
  handleAdminGetPaymentGatewayStatus, handleAdminPatchPaymentGateway, handleAdminTestPaymentGateway,
  handleAdminPostVendor, handleAdminGetVendor, handleAdminPatchVendor, handleAdminPatchVendorStatus,
  handleAdminResetVendorPassword, handleAdminGetVendorStats, handleAdminGetVendorOrders, handleAdminGetVendorActivity
} from './admin.js';
import { handleGetRoles, handleGetPermissions } from './admin/roles.js';
import { handleGetTeam, handlePostTeamMember } from './admin/team.js';
import { 
  handleGetUsers, handleGetUserById, handlePatchUserStatus, handleGetUserDetails, handleUpdateUserCredentials
} from './admin/users.js';
import { handleGetBranches, handlePostBranch, handlePatchBranch, handleGetSubjects, handlePostSubject, handleDeleteSubject } from './admin/academic.js';
import { handleGenericGet, handleGenericPost, handleGenericPatch, handleGenericDelete } from './admin/academic_generic.js';
import { handleGetManuals as handleAdminGetManuals, handleAdminGetManualById, handlePostManual, handlePatchManual, handleDeleteManual } from './admin/manuals.js';
import { handleGetSettings, handlePatchSettings, handleGetPricingSettings, handlePatchPricingSettings } from './admin/settings.js';

import { handleAdminGetCoupons, handleAdminPostCoupon, handleAdminPatchCoupon } from './admin/coupons.js';

export const adminRouter = new Router();

// Middleware: Authenticate Admin & inject context
adminRouter.use(async (request, env, context) => {
  const adminAuthResult = await verifyAdminAuth(request, env);
  if (adminAuthResult.error) return adminAuthResult.error;
  context.admin = adminAuthResult.context.admin;
  context.adminId = adminAuthResult.context.adminId;
  context.role = adminAuthResult.context.role;
  context.permissions = adminAuthResult.context.permissions;
});

const perm = (p) => async (request, env, context) => {
  const res = await requirePermission(p)(request, env, context);
  if (res && res.error) return res.error;
};

// Dashboard & Analytics
adminRouter.get('/dashboard', perm('dashboard.view'), handleAdminGetDashboard);
adminRouter.get('/analytics', perm('analytics.view'), handleAdminGetAnalytics);

// Orders
adminRouter.get('/orders/export', perm('orders.view'), handleAdminOrdersExport);
adminRouter.post('/orders/import/validate', perm('orders.edit'), handleAdminOrdersImportValidate);
adminRouter.post('/orders/import/commit', perm('orders.edit'), handleAdminOrdersImportCommit);
adminRouter.patch('/orders/bulk', perm('orders.edit'), handleAdminBulkPatchOrders);
adminRouter.get('/orders/batches', perm('orders.view'), handleAdminGetCommonManualBatches);
adminRouter.patch('/orders/:id/status', perm('orders.edit'), (req, env, ctx) => handleAdminPatchOrderStatus(req, env, ctx, ctx.params.id));
adminRouter.patch('/orders/:id/vendor', perm('orders.assign'), (req, env, ctx) => handleAdminPatchOrderVendor(req, env, ctx, ctx.params.id));
adminRouter.get('/orders/:id', perm('orders.view'), (req, env, ctx) => handleAdminGetOrder(req, env, ctx, ctx.params.id));
adminRouter.get('/orders', perm('orders.view'), handleAdminGetOrders);

// Documents
adminRouter.get('/documents/:id/access', perm('orders.view'), (req, env, ctx) => handleAdminGetDocumentAccess(req, env, ctx, ctx.params.id));

// Roles & Team
adminRouter.get('/roles', perm('users.view'), handleGetRoles);
adminRouter.get('/permissions', perm('users.view'), handleGetPermissions);
adminRouter.get('/team', perm('users.view'), handleGetTeam);
adminRouter.post('/team', perm('users.edit'), handlePostTeamMember);

// Users
adminRouter.patch('/users/:id/credentials', perm('users.edit'), (req, env, ctx) => handleUpdateUserCredentials(req, env, ctx, ctx.params.id));
adminRouter.patch('/users/:id/status', perm('users.edit'), (req, env, ctx) => handlePatchUserStatus(req, env, ctx, ctx.params.id));
adminRouter.get('/users/:id/details', perm('users.view'), (req, env, ctx) => handleGetUserDetails(req, env, ctx, ctx.params.id));
adminRouter.get('/users/:id', perm('users.view'), (req, env, ctx) => handleGetUserById(req, env, ctx, ctx.params.id));
adminRouter.get('/users', perm('users.view'), handleGetUsers);

// Academic - Subjects & Branches
adminRouter.get('/academic/subjects', perm('catalog.view'), handleGetSubjects);
adminRouter.post('/academic/subjects', perm('catalog.edit'), handlePostSubject);
adminRouter.delete('/academic/subjects/:id', perm('catalog.edit'), (req, env, ctx) => handleDeleteSubject(req, env, ctx, ctx.params.id));

adminRouter.get('/academic/branches', perm('catalog.view'), handleGetBranches);
adminRouter.post('/academic/branches', perm('catalog.edit'), handlePostBranch);
adminRouter.patch('/academic/branches/:id', perm('catalog.edit'), (req, env, ctx) => handlePatchBranch(req, env, ctx, ctx.params.id));

// Academic - Generic Entities
adminRouter.get('/academic/:entity/:id', perm('catalog.view'), (req, env, ctx) => handleGenericGet(req, env, ctx, ctx.params.entity, ctx.params.id));
adminRouter.patch('/academic/:entity/:id', perm('catalog.edit'), (req, env, ctx) => handleGenericPatch(req, env, ctx, ctx.params.entity, ctx.params.id));
adminRouter.delete('/academic/:entity/:id', perm('catalog.edit'), (req, env, ctx) => handleGenericDelete(req, env, ctx, ctx.params.entity, ctx.params.id));
adminRouter.get('/academic/:entity', perm('catalog.view'), (req, env, ctx) => handleGenericGet(req, env, ctx, ctx.params.entity));
adminRouter.post('/academic/:entity', perm('catalog.edit'), (req, env, ctx) => handleGenericPost(req, env, ctx, ctx.params.entity));

// Manuals
adminRouter.get('/manuals/:id', perm('catalog.view'), (req, env, ctx) => handleAdminGetManualById(req, env, ctx, ctx.params.id));
adminRouter.patch('/manuals/:id', perm('catalog.edit'), (req, env, ctx) => handlePatchManual(req, env, ctx, ctx.params.id));
adminRouter.delete('/manuals/:id', perm('catalog.edit'), (req, env, ctx) => handleDeleteManual(req, env, ctx, ctx.params.id));
adminRouter.get('/manuals', perm('catalog.view'), handleAdminGetManuals);
adminRouter.post('/manuals', perm('catalog.edit'), handlePostManual);

// Coupons
adminRouter.get('/coupons', perm('settings.view'), handleAdminGetCoupons);
adminRouter.post('/coupons', perm('settings.edit'), handleAdminPostCoupon);
adminRouter.patch('/coupons/:id', perm('settings.edit'), (req, env, ctx) => handleAdminPatchCoupon(req, env, ctx, ctx.params.id));

// Settings & Pricing
adminRouter.get('/settings/pricing', perm('settings.view'), handleGetPricingSettings);
adminRouter.patch('/settings/pricing', perm('settings.edit'), handlePatchPricingSettings);
adminRouter.get('/settings', perm('settings.view'), handleGetSettings);
adminRouter.patch('/settings', perm('settings.edit'), handlePatchSettings);

// Payment Gateway, Payments & Refunds
adminRouter.get('/payment-gateway/status', perm('payments.view'), handleAdminGetPaymentGatewayStatus);
adminRouter.patch('/payment-gateway', perm('payments.edit'), handleAdminPatchPaymentGateway);
adminRouter.post('/payment-gateway/test', perm('payments.edit'), handleAdminTestPaymentGateway);
adminRouter.get('/payments', perm('payments.view'), handleAdminGetPayments);

import { handleAdminGetRefunds, handleAdminPostRefund, handleAdminGetStudentRefunds } from './admin.js';
adminRouter.get('/refunds', perm('payments.view'), handleAdminGetRefunds);
adminRouter.post('/refunds', perm('payments.edit'), handleAdminPostRefund);
adminRouter.get('/students/:studentId/refunds', perm('users.view'), (req, env, ctx) => handleAdminGetStudentRefunds(req, env, ctx, ctx.params.studentId));

// Vendors
adminRouter.patch('/vendors/:id/status', perm('vendors.edit'), (req, env, ctx) => handleAdminPatchVendorStatus(req, env, ctx, ctx.params.id));
adminRouter.post('/vendors/:id/reset-password', perm('vendors.edit'), (req, env, ctx) => handleAdminResetVendorPassword(req, env, ctx, ctx.params.id));
adminRouter.get('/vendors/:id/stats', perm('vendors.view'), (req, env, ctx) => handleAdminGetVendorStats(req, env, ctx.params.id));
adminRouter.get('/vendors/:id/orders', perm('vendors.view'), (req, env, ctx) => handleAdminGetVendorOrders(req, env, ctx.params.id));
adminRouter.get('/vendors/:id/activity', perm('vendors.view'), (req, env, ctx) => handleAdminGetVendorActivity(req, env, ctx.params.id));
adminRouter.patch('/vendors/:id', perm('vendors.edit'), (req, env, ctx) => handleAdminPatchVendor(req, env, ctx, ctx.params.id));
adminRouter.get('/vendors/:id', perm('vendors.view'), (req, env, ctx) => handleAdminGetVendor(req, env, ctx.params.id));
adminRouter.get('/vendors', perm('vendors.view'), handleAdminGetVendors);
adminRouter.post('/vendors', perm('vendors.edit'), handleAdminPostVendor);

// Audit & Content & Exports
adminRouter.get('/audit', perm('audit.view'), handleAdminGetAuditLogs);
adminRouter.get('/content', perm('content.view'), handleAdminGetContent);
adminRouter.post('/content', perm('content.edit'), handleAdminPostContent);
adminRouter.patch('/content/:id', perm('content.edit'), (req, env, ctx) => handleAdminPatchContent(req, env, ctx, ctx.params.id));
adminRouter.delete('/content/:id', perm('content.edit'), (req, env, ctx) => handleAdminDeleteContent(req, env, ctx, ctx.params.id));
adminRouter.post('/content/upload', perm('content.upload'), handleAdminUploadContent);
adminRouter.get('/exports/:type', (req, env, ctx) => perm(`exports.${ctx.params.type}`)(req, env, ctx).then(err => err || handleAdminGetExports(req, env, ctx.params.type)));
