import { getStudentByUserId, upsertStudent } from '../services/studentService.js';
import { successResponse, errorResponse } from '../utils/response.js';

export async function handleGetMe(request, env, context) {
  const userId = context.user.id;
  
  try {
    const student = await getStudentByUserId(env.DB, userId);
    
    if (!student) {
      return errorResponse('NOT_FOUND', 'Student profile not found', 404);
    }
    
    return successResponse({ student }, 200);
  } catch (error) {
    console.error('D1 error:', error);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve student profile', 500);
  }
}

export async function handlePutMe(request, env, context) {
  const userId = context.user.id;
  
  try {
    const body = await request.json();
    
    const requiredFields = ['name', 'roll_number', 'phone', 'college_id', 'branch_id', 'study_year_id', 'semester_id'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return errorResponse('BAD_REQUEST', `Missing required field: ${field}`, 400);
      }
    }
    
    const studentData = {
      id: userId,
      name: body.name,
      roll_number: body.roll_number,
      phone: body.phone,
      email: body.email,
      college_id: body.college_id,
      branch_id: body.branch_id,
      study_year_id: body.study_year_id,
      semester_id: body.semester_id,
      section: body.section
    };
    
    const student = await upsertStudent(env.DB, studentData);
    return successResponse({ student }, 200);
    
  } catch (error) {
    console.error('D1 Upsert error full message:', error.message);
    console.error('Attempted to insert payload:', studentData);
    if (error.message.includes('FOREIGN KEY constraint failed') || error.message.includes('D1_ERROR')) {
      return errorResponse('BAD_REQUEST', 'Invalid academic relationship or duplicate entry provided.', 400);
    }
    return errorResponse('SERVER_ERROR', 'Failed to synchronize student profile', 500);
  }
}
