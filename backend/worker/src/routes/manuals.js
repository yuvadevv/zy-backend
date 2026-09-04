import { getFilters, getManuals, getManualById } from '../services/manualService.js';
import { successResponse, errorResponse } from '../utils/response.js';

export async function handleGetFilters(request, env) {
  try {
    const filters = await getFilters(env.DB);
    return successResponse(filters, 200);
  } catch (error) {
    console.error('D1 Error fetching filters:', error);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve filters', 500);
  }
}

export async function handleGetManuals(request, env) {
  try {
    const url = new URL(request.url);
    const params = {
      branchId: url.searchParams.get('branchId'),
      studyYearId: url.searchParams.get('studyYearId'),
      semesterId: url.searchParams.get('semesterId'),
      subjectId: url.searchParams.get('subjectId'),
      search: url.searchParams.get('search')
    };

    const manuals = await getManuals(env.DB, params);
    return successResponse({ manuals }, 200);
  } catch (error) {
    console.error('D1 Error fetching manuals:', error);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve manuals', 500);
  }
}

export async function handleGetManualById(request, env, id) {
  try {
    const manual = await getManualById(env.DB, id);
    if (!manual) {
      return errorResponse('NOT_FOUND', 'Manual not found', 404);
    }
    return successResponse({ manual }, 200);
  } catch (error) {
    console.error('D1 Error fetching manual:', error);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve manual', 500);
  }
}

export async function handleGetManualFile(request, env, context, id) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const manual = await env.DB.prepare(`SELECT * FROM manuals WHERE id = ?`).bind(id).first();
    if (!manual) return errorResponse('NOT_FOUND', 'Manual not found', 404);

    if (manual.availability_status !== 'available' && manual.availability_status !== 'in_stock') {
      return errorResponse('FORBIDDEN', 'Manual file unavailable', 403);
    }

    if (!manual.r2_object_key) {
      return errorResponse('NOT_FOUND', 'File unavailable for this manual.', 404);
    }

    // Pass range if provided
    const range = request.headers.get('Range');
    const getOptions = range ? { range } : {};
    
    const object = await env.DOCUMENTS.get(manual.r2_object_key, getOptions);
    if (!object) {
      return errorResponse('NOT_FOUND', 'File not found in storage.', 404);
    }

    const headers = new Headers();
    if (typeof object.writeHttpMetadata === 'function') {
      object.writeHttpMetadata(headers);
    }
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    
    if (range) {
      headers.set('Accept-Ranges', 'bytes');
    }

    return new Response(object.body, { 
      status: range ? 206 : 200,
      headers 
    });
  } catch (error) {
    console.error('Error fetching manual file:', error);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve manual file', 500);
  }
}
