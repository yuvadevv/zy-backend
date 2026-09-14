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

export async function handleGetCodeTantraSettings(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT setting_value
      FROM platform_settings
      WHERE setting_key = 'code_tantra_settings'
    `).all();

    let settings = {
      reviewThreshold: 100 * 1024 * 1024,
      enableOversizedReview: true,
      allowAdminApproval: true,
      hardMaximum: null,
      whatsappNumber: '9581353999',
      whatsappMessageTemplate: 'Hello BLINTZY Admin,\\n\\nI am trying to upload a Code Tantra Files project, but my file exceeds the current upload review threshold.\\n\\nStudent Name: {studentName}\\nStudent ID: {studentId}\\nOrder ID: {orderId}\\nFile Name: {fileName}\\nFile Size: {fileSize}\\nFile Type: {fileType}\\nPDF Count: {pdfCount}\\nTotal Pages: {totalPages}\\n\\nPlease review my file and guide me on how to proceed.',
      oversizedMessage: 'Your file requires Admin review before processing. Please contact the BLINTZY Admin for approval or further instructions.'
    };
    
    if (results && results.length > 0) {
      try {
        const stored = JSON.parse(results[0].setting_value);
        settings = { ...settings, ...stored };
      } catch (e) {
        console.error('Failed to parse code tantra settings', e);
      }
    }

    return successResponse({ settings });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch code tantra settings', 500);
  }
}
