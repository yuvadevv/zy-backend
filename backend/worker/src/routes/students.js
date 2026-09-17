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
    
    // Fetch existing student to support partial updates
    const existing = await getStudentByUserId(env.DB, userId);
    
    const parseOptional = (val, existingVal) => {
      const v = val !== undefined ? val : existingVal;
      return v === "" ? null : (v || null);
    };

    const studentData = {
      id: userId,
      name: body.name !== undefined ? body.name : existing?.name,
      roll_number: body.roll_number !== undefined ? body.roll_number : existing?.roll_number,
      phone: body.phone !== undefined ? body.phone : existing?.phone,
      email: body.email !== undefined ? body.email : existing?.email,
      college_id: body.college_id !== undefined ? body.college_id : existing?.college_id,
      branch_id: body.branch_id !== undefined ? body.branch_id : existing?.branch_id,
      study_year_id: body.study_year_id !== undefined ? body.study_year_id : existing?.year,
      semester_id: body.semester_id !== undefined ? body.semester_id : existing?.semester,
      section: parseOptional(body.section, existing?.section),
      block_id: parseOptional(body.block_id, existing?.block_id),
      classroom_id: parseOptional(body.classroom_id, existing?.classroom_id)
    };
    
    const requiredFields = ['name', 'roll_number', 'phone', 'college_id', 'branch_id', 'study_year_id', 'semester_id'];
    for (const field of requiredFields) {
      if (!studentData[field]) {
        return errorResponse('BAD_REQUEST', `Missing required field: ${field}`, 400);
      }
    }
    
    const student = await upsertStudent(env.DB, studentData);
    return successResponse({ student }, 200);
    
  } catch (error) {
    console.error('D1 Upsert error full message:', error.message || error);
    if (error.message && (error.message.includes('FOREIGN KEY constraint failed') || error.message.includes('D1_ERROR'))) {
      return errorResponse('BAD_REQUEST', 'Invalid academic relationship or duplicate entry provided.', 400);
    }
    return errorResponse('SERVER_ERROR', error.message || 'Failed to synchronize student profile', 500);
  }
}
