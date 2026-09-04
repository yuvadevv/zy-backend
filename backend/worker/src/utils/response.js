export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

export function successResponse(data, status = 200, headers = {}) {
  return jsonResponse({
    success: true,
    data: data,
    ...(typeof data === 'object' && data !== null ? data : {})
  }, status, headers);
}

export function errorResponse(code, message, status = 400, headers = {}) {
  return jsonResponse({
    success: false,
    error: {
      code,
      message
    }
  }, status, headers);
}
