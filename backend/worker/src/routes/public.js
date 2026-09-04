import { errorResponse, successResponse } from '../utils/response.js';

export async function handleGetContent(request, env) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    
    let query = `
      SELECT id, content_type as type, title, metadata, priority, start_time as starts_at, end_time as expires_at 
      FROM website_content 
      WHERE status = 'active' 
      AND (start_time IS NULL OR start_time <= ?)
      AND (end_time IS NULL OR end_time > ?)
    `;
    const params = [Date.now(), Date.now()];

    if (type) {
      query += ` AND content_type = ?`;
      params.push(type);
    }
    
    query += ` ORDER BY priority DESC, created_at DESC`;

    const results = await env.DB.prepare(query).bind(...params).all();
    
    // Parse metadata
    const parsedResults = results.results.map(row => {
      let meta = {};
      try {
        meta = JSON.parse(row.metadata || '{}');
      } catch(e) {}
      
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        message: meta.subtitle || meta.message || meta.description || '',
        cta_label: meta.cta || meta.cta_label || '',
        cta_url: meta.url || meta.cta_url || '',
        image_key: meta.image_key || meta.image_url || '',
        theme: meta.theme || '',
        icon: meta.icon || '',
        priority: row.priority,
        starts_at: row.starts_at,
        expires_at: row.expires_at
      };
    });

    return successResponse({ content: parsedResults });
  } catch (err) {
    console.error('Error fetching public content:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch content', 500);
  }
}

export async function handleGetPlatformStatus(request, env) {
  try {
    // In D1, settings are stored as JSON in platform_settings
    // We only expose public settings to the student app.
    const result = await env.DB.prepare('SELECT setting_key, setting_value FROM platform_settings').all();
    const settings = result.results.reduce((acc, row) => {
      try {
        acc[row.setting_key] = row.setting_value ? JSON.parse(row.setting_value) : null;
      } catch (e) {
        acc[row.setting_key] = row.setting_value;
      }
      return acc;
    }, {});

    const isMaintenance = typeof settings.maintenance_mode === 'object' 
      ? Boolean(settings.maintenance_mode?.enabled) 
      : Boolean(settings.maintenance_mode);

    const publicStatus = {
      maintenance_mode: isMaintenance,
      maintenance_message: settings.global_banner?.text || 'Platform is under maintenance. Please check back later.',
      support_email: settings.support_email || 'support@blintzy.com',
      support_phone: settings.support_phone || null,
      support_whatsapp: settings.support_whatsapp || null
    };

    return successResponse(publicStatus);
  } catch (err) {
    console.error('Error fetching platform status:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch platform status', 500);
  }
}

export async function handleGetAcademicOptions(request, env) {
  try {
    const fetchActive = async (table) => {
      try {
        const { results } = await env.DB.prepare(`SELECT * FROM ${table} WHERE status = 'active'`).all();
        return results;
      } catch (e) {
        // Fallback for tables that don't have status yet or don't exist
        return [];
      }
    };

    const [colleges, branches, academicYears, semesters, sections, blocks, classrooms] = await Promise.all([
      fetchActive('colleges'),
      fetchActive('branches'),
      fetchActive('academic_years'),
      fetchActive('semesters'),
      fetchActive('sections'),
      fetchActive('blocks'),
      fetchActive('classrooms')
    ]);

    return successResponse({
      colleges,
      branches,
      academicYears,
      semesters,
      sections,
      blocks,
      classrooms
    });
  } catch (err) {
    console.error('Error fetching academic options:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch academic options', 500);
  }
}

const DEFAULT_PRICING_SETTINGS = {
  printRates: {
    bw_single: 1.0,
    bw_double: 1.5,
    color_single: 5.0,
    color_double: 8.0
  },
  bindingFees: {
    none: 0,
    spiral: 30.0,
    soft_bound: 50.0,
    hard_bound: 100.0
  },
  defaultDeliveryFee: 40.0
};

export async function handleGetPublicPricingSettings(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT setting_value
      FROM platform_settings
      WHERE setting_key = 'pricing_settings'
    `).all();

    let settings = DEFAULT_PRICING_SETTINGS;
    if (results && results.length > 0) {
      try {
        const stored = JSON.parse(results[0].setting_value);
        settings = { ...DEFAULT_PRICING_SETTINGS, ...stored };
      } catch (e) {
        console.error('Failed to parse pricing settings', e);
      }
    }

    return successResponse({ settings });
  } catch (err) {
    console.error('Get public pricing settings error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch pricing settings', 500);
  }
}
