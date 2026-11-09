import { Router } from '../core/Router.js';
import { 
  handleGetFoodProducts,
  handleGetFoodProductById,
  handleGetFoodCategories,
  handlePreviewFoodOrder,
  handleCreateFoodOrder,
  handleVerifyFoodPayment,
  handleGetFoodOrders,
  handleGetFoodOrderById as handleGetStudentFoodOrderById,
  handleVerifyFoodPickup,
  handleVendorGetDashboard,
  handleVendorGetOrders,
  handleVendorUpdateOrderStatus,
  handleVendorGetMenu,
  handleVendorCreateMenuItem,
  handleVendorUpdateMenuItem,
  handleVendorToggleAvailability,
  handleVendorUpdateStock,
  handleVendorVerifyPickup,
  handleVendorGetMe,
  handleVendorGetStaff,
  handleVendorCreateStaff,
  handleVendorUpdateStaff,
  handleVendorDeleteStaff,
  handleVendorGetMessSchedules,
  handleVendorCreateMessSchedule,
  handleVendorUpdateMessSchedule,
  handleVendorCopyDayMessSchedule,
  handleVendorGetIngredients,
  handleVendorCreateIngredient,
  handleVendorUpdateIngredientStock,
  handleVendorLogIngredientConsumption,
  handleVendorGetSettings,
  handleVendorUpdateSettings,
  handleVendorGetPayments,
  handleVendorRequestSettlement,
  handleVendorOnboardingApply,
  handleVendorGetOnboardingProgress,
  handleVendorUpdateOnboardingStep,
  handleVendorBulkCreateMenu,
  handleVendorBulkUpdateAvailability,
  handleVendorImportMenuCSV,
  handleVendorExportMenuCSV
} from './food.js';
import { verifyAuth } from '../middleware/auth.js';
import { verifyVendorAuth } from '../middleware/vendorAuth.js';
import { verifyAdminAuth } from '../middleware/adminAuth.js';
import { errorResponse } from '../utils/response.js';

export const foodRouter = new Router();

// Student auth middleware for protected order actions
async function requireStudentAuth(request, env, context) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && env.ENVIRONMENT !== 'production') {
    if (authHeader === 'Bearer dev_test' || authHeader.startsWith('Bearer test_student_')) {
      const sId = authHeader.replace('Bearer ', '');
      context.user = { id: sId, email: `${sId}@campus.edu` };
      context.userId = sId;
      return;
    }
  }
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
}

// Vendor auth middleware enforcing vendor isolation & ownership
async function requireFoodVendorAuth(request, env, context) {
  const authHeader = request.headers.get('Authorization');
  const requestedVendorId = 
    request.headers.get('X-Vendor-ID') || 
    new URL(request.url).searchParams.get('vendorId');

  // Dev bypass for automated testing & local verification
  if (authHeader && env.ENVIRONMENT !== 'production') {
    if (authHeader === 'Bearer dev_vendor_stall') {
      context.vendor = { id: 'vendor_canteen_stall', name: 'Campus Canteen Stall', type: 'canteen' };
      context.vendorId = 'vendor_canteen_stall';
    } else if (authHeader === 'Bearer dev_vendor_mess') {
      context.vendor = { id: 'vendor_college_mess', name: 'College Mess Dining', type: 'mess' };
      context.vendorId = 'vendor_college_mess';
    } else if (authHeader === 'Bearer dev_admin') {
      context.admin = { id: 'admin_dev', role: 'super_admin' };
      context.vendorId = requestedVendorId || 'vendor_canteen_stall';
      return;
    }
  }

  // Real JWT verification
  if (!context.vendorId && authHeader?.startsWith('Bearer ')) {
    try {
      const authRes = await verifyVendorAuth(request, env);
      if (!authRes.error && authRes.context?.vendor) {
        context.vendor = authRes.context.vendor;
        context.vendorId = authRes.context.vendor.id;
      }
    } catch {
      // Fallback in dev
    }
  }

  // Fallback to X-Vendor-ID in dev if still not set
  if (!context.vendorId && env.ENVIRONMENT !== 'production' && requestedVendorId) {
    context.vendorId = requestedVendorId;
    context.vendor = {
      id: requestedVendorId,
      name: requestedVendorId === 'vendor_college_mess' ? 'College Mess Dining' : 'Campus Canteen Stall',
      type: requestedVendorId === 'vendor_college_mess' ? 'mess' : 'canteen'
    };
  }

  // If vendor context was set, enforce vendor isolation
  if (context.vendorId && requestedVendorId && context.vendorId !== requestedVendorId && !context.admin) {
    return errorResponse('FORBIDDEN', `Access Denied: You cannot view or modify data for another vendor (${requestedVendorId}).`, 403);
  }

  if (!context.vendorId && !context.admin) {
    return errorResponse('UNAUTHORIZED', 'Vendor authentication required', 401);
  }
}

// ==========================================
// PUBLIC STUDENT FOOD CATALOGUE ENDPOINTS
// ==========================================
foodRouter.get('/products', handleGetFoodProducts);
foodRouter.get('/products/:id', (req, env, ctx) => handleGetFoodProductById(req, env, ctx, req.params.id));
foodRouter.get('/categories', handleGetFoodCategories);

// ==========================================
// VENDOR OPERATIONS ENDPOINTS (Isolated Data)
// ==========================================
foodRouter.get('/vendor/me', requireFoodVendorAuth, handleVendorGetMe);
foodRouter.get('/vendor/dashboard', requireFoodVendorAuth, handleVendorGetDashboard);
foodRouter.get('/vendor/orders', requireFoodVendorAuth, handleVendorGetOrders);
foodRouter.patch('/vendor/orders/:id/status', requireFoodVendorAuth, (req, env, ctx) => handleVendorUpdateOrderStatus(req, env, ctx, req.params.id));
foodRouter.get('/vendor/menu', requireFoodVendorAuth, handleVendorGetMenu);
foodRouter.post('/vendor/menu', requireFoodVendorAuth, handleVendorCreateMenuItem);
foodRouter.put('/vendor/menu/:id', requireFoodVendorAuth, (req, env, ctx) => handleVendorUpdateMenuItem(req, env, ctx, req.params.id));
foodRouter.patch('/vendor/menu/:id/toggle-availability', requireFoodVendorAuth, (req, env, ctx) => handleVendorToggleAvailability(req, env, ctx, req.params.id));
foodRouter.patch('/vendor/inventory/update-stock', requireFoodVendorAuth, handleVendorUpdateStock);
foodRouter.post('/vendor/verify-pickup', requireFoodVendorAuth, handleVendorVerifyPickup);

// Step 10 Vendor Enterprise Modules
foodRouter.get('/vendor/staff', requireFoodVendorAuth, handleVendorGetStaff);
foodRouter.post('/vendor/staff', requireFoodVendorAuth, handleVendorCreateStaff);
foodRouter.patch('/vendor/staff/:id', requireFoodVendorAuth, (req, env, ctx) => handleVendorUpdateStaff(req, env, ctx, req.params.id));
foodRouter.delete('/vendor/staff/:id', requireFoodVendorAuth, (req, env, ctx) => handleVendorDeleteStaff(req, env, ctx, req.params.id));

foodRouter.get('/vendor/mess/schedules', requireFoodVendorAuth, handleVendorGetMessSchedules);
foodRouter.post('/vendor/mess/schedules', requireFoodVendorAuth, handleVendorCreateMessSchedule);
foodRouter.patch('/vendor/mess/schedules/:id', requireFoodVendorAuth, (req, env, ctx) => handleVendorUpdateMessSchedule(req, env, ctx, req.params.id));
foodRouter.post('/vendor/mess/schedules/copy-day', requireFoodVendorAuth, handleVendorCopyDayMessSchedule);

foodRouter.get('/vendor/ingredients', requireFoodVendorAuth, handleVendorGetIngredients);
foodRouter.post('/vendor/ingredients', requireFoodVendorAuth, handleVendorCreateIngredient);
foodRouter.patch('/vendor/ingredients/:id/stock', requireFoodVendorAuth, (req, env, ctx) => handleVendorUpdateIngredientStock(req, env, ctx, req.params.id));
foodRouter.post('/vendor/ingredients/consumption', requireFoodVendorAuth, handleVendorLogIngredientConsumption);

foodRouter.get('/vendor/settings', requireFoodVendorAuth, handleVendorGetSettings);
foodRouter.patch('/vendor/settings', requireFoodVendorAuth, handleVendorUpdateSettings);

foodRouter.get('/vendor/payments', requireFoodVendorAuth, handleVendorGetPayments);
foodRouter.post('/vendor/settlements/request', requireFoodVendorAuth, handleVendorRequestSettlement);

// Step 11 Vendor Onboarding & Bulk Menu Operations
foodRouter.post('/vendor/onboarding/apply', handleVendorOnboardingApply);
foodRouter.get('/vendor/onboarding/progress', requireFoodVendorAuth, handleVendorGetOnboardingProgress);
foodRouter.patch('/vendor/onboarding/step', requireFoodVendorAuth, handleVendorUpdateOnboardingStep);
foodRouter.post('/vendor/menu/bulk-create', requireFoodVendorAuth, handleVendorBulkCreateMenu);
foodRouter.post('/vendor/menu/bulk-availability', requireFoodVendorAuth, handleVendorBulkUpdateAvailability);
foodRouter.post('/vendor/menu/import-csv', requireFoodVendorAuth, handleVendorImportMenuCSV);
foodRouter.get('/vendor/menu/export-csv', requireFoodVendorAuth, handleVendorExportMenuCSV);

// ==========================================
// STUDENT & GENERAL FOOD ENDPOINTS
// ==========================================
// 1. Order Preview (Public & authenticated preview)
foodRouter.post('/orders/preview', handlePreviewFoodOrder);

// 2. Quick pickup verification by ID
foodRouter.post('/orders/:id/verify-pickup', (req, env, ctx) => handleVerifyFoodPickup(req, env, ctx, req.params.id));

// 3. Student authenticated order actions
foodRouter.post('/orders/create', requireStudentAuth, handleCreateFoodOrder);
foodRouter.post('/orders/verify-payment', requireStudentAuth, handleVerifyFoodPayment);
foodRouter.get('/orders', requireStudentAuth, handleGetFoodOrders);
foodRouter.get('/orders/:id', requireStudentAuth, (req, env, ctx) => handleGetStudentFoodOrderById(req, env, ctx, req.params.id));
