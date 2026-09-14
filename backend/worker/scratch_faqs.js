
export async function handleGetFaqs(request, env) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM faqs WHERE status = ? ORDER BY display_order ASC, created_at DESC').bind('active').all();
    return successResponse({ faqs: results });
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch FAQs', 500);
  }
}
