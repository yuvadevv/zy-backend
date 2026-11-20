import { getStudentByUserId, upsertStudent } from '../services/studentService.js';
import { successResponse, errorResponse } from '../utils/response.js';

export async function handleGetMe(request, env, context) {
  const userId = context.user.id;
  
  try {
    const student = await getStudentByUserId(env.DB, userId);
    
    if (!student) {
      // For new Google users who haven't completed their academic profile yet
      const userName = context.user?.user_metadata?.full_name || 
                       context.user?.user_metadata?.name || 
                       context.user?.name || 
                       (context.user?.email ? context.user.email.split('@')[0] : 'Student');
      const userAvatar = context.user?.user_metadata?.avatar_url || 
                         context.user?.user_metadata?.picture || 
                         null;
      const userPhone = context.user?.user_metadata?.phone || 
                        context.user?.phone || 
                        '';

      return successResponse({ 
        student: {
          id: userId,
          name: userName,
          email: context.user?.email || '',
          phone: userPhone,
          avatar_url: userAvatar,
          academic_profile_completed: false
        }
      }, 200);
    }
    
    // If avatar_url is not set in DB but available from current session, attach it
    if (!student.avatar_url && (context.user?.user_metadata?.avatar_url || context.user?.user_metadata?.picture)) {
      student.avatar_url = context.user.user_metadata.avatar_url || context.user.user_metadata.picture;
    }

    // Automatically ensure student has a referral code backfilled
    try {
      const { getOrCreateReferralCode } = await import('../services/referralService.js');
      const referralCode = await getOrCreateReferralCode(env.DB, userId);
      student.referral_code = referralCode;
    } catch (refErr) {
      console.warn('Student referral code backfill non-fatal:', refErr);
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

    const studentName = body.name !== undefined 
      ? body.name 
      : (existing?.name || context.user?.user_metadata?.full_name || context.user?.name || 'Student');

    const studentPhone = body.phone !== undefined 
      ? body.phone 
      : (existing?.phone || context.user?.user_metadata?.phone || '');

    const studentAvatar = body.avatar_url !== undefined
      ? body.avatar_url
      : (existing?.avatar_url || context.user?.user_metadata?.avatar_url || context.user?.user_metadata?.picture || null);

    const studentData = {
      id: userId,
      name: studentName,
      roll_number: body.roll_number !== undefined ? body.roll_number : existing?.roll_number,
      phone: studentPhone,
      email: body.email !== undefined ? body.email : (existing?.email || context.user?.email || null),
      avatar_url: studentAvatar,
      college_id: body.college_id !== undefined ? body.college_id : (existing?.college_id || 'COL-001'),
      branch_id: body.branch_id !== undefined ? body.branch_id : existing?.branch_id,
      study_year_id: body.study_year_id !== undefined ? body.study_year_id : existing?.year,
      semester_id: body.semester_id !== undefined ? body.semester_id : (existing?.semester || 's_1'),
      section: parseOptional(body.section, existing?.section),
      block_id: parseOptional(body.block_id, existing?.block_id),
      classroom_id: parseOptional(body.classroom_id, existing?.classroom_id)
    };
    
    // Validate required fields for academic profile completion
    const requiredFields = [
      { key: 'name', label: 'Full Name' },
      { key: 'roll_number', label: 'Roll Number' },
      { key: 'phone', label: 'Mobile Number' },
      { key: 'college_id', label: 'College' },
      { key: 'branch_id', label: 'Branch / Department' },
      { key: 'study_year_id', label: 'Academic Year' },
      { key: 'section', label: 'Section' },
      { key: 'block_id', label: 'Block' },
      { key: 'classroom_id', label: 'Classroom Number' }
    ];

    for (const field of requiredFields) {
      if (!studentData[field.key] || !String(studentData[field.key]).trim()) {
        return errorResponse('BAD_REQUEST', `Missing required field: ${field.label}`, 400);
      }
    }
    
    const student = await upsertStudent(env.DB, studentData);
    return successResponse({ student }, 200);
    
  } catch (error) {
    console.error('D1 Upsert error full message:', error.message || error);
    if (error.code === 'ROLL_NUMBER_DUPLICATE' || error.message?.includes('already registered by another student')) {
      return errorResponse('CONFLICT', 'This roll number is already registered by another student. Please check your roll number.', 409);
    }
    if (error.message && (error.message.includes('FOREIGN KEY constraint failed') || error.message.includes('D1_ERROR'))) {
      return errorResponse('BAD_REQUEST', 'Invalid academic relationship or duplicate entry provided.', 400);
    }
    return errorResponse('SERVER_ERROR', error.message || 'Failed to synchronize student profile', 500);
  }
}
