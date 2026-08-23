import { successResponse } from '../utils/response.js';

export function handleHealth() {
  return successResponse({
    service: 'BLINTZY API',
    status: 'healthy'
  }, 200);
}
