import { successResponse, errorResponse } from '../../utils/response.js';

export async function handleAdminGetFaqs(request, env) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM faqs ORDER BY display_order ASC, created_at DESC').all();
    return successResponse({ faqs: results });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch FAQs', 500);
  }
}

export async function handleAdminPostFaq(request, env) {
  try {
    const data = await request.json();
    const id = 'faq_' + Math.random().toString(36).substr(2, 9);
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO faqs (id, category, question, answer, display_order, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      data.category || 'General',
      data.question,
      data.answer,
      data.display_order || 0,
      data.status || 'active',
      now,
      now
    ).run();

    return successResponse({ id, message: 'FAQ created successfully' });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to create FAQ', 500);
  }
}

export async function handleAdminPatchFaq(request, env, context, id) {
  try {
    const data = await request.json();
    const now = Date.now();
    const updates = [];
    const values = [];

    ['category', 'question', 'answer', 'display_order', 'status'].forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    });

    if (updates.length === 0) {
      return errorResponse('BAD_REQUEST', 'No fields to update', 400);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await env.DB.prepare(`UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    
    return successResponse({ message: 'FAQ updated successfully' });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to update FAQ', 500);
  }
}

export async function handleAdminDeleteFaq(request, env, context, id) {
  try {
    await env.DB.prepare('DELETE FROM faqs WHERE id = ?').bind(id).run();
    return successResponse({ message: 'FAQ deleted successfully' });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to delete FAQ', 500);
  }
}
