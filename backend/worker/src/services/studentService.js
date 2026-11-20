export async function getStudentByUserId(db, userId) {
  try {
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.roll_number, s.phone, s.email, s.avatar_url, s.academic_profile_completed,
             s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
             s.block_id, s.classroom_id,
             c.name as college_name, b.name as branch_name,
             ay.label as year_label, sem.label as semester_label, sec.name as section_name,
             bl.name as block_name, cl.name as classroom_name
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      LEFT JOIN sections sec ON s.section = sec.id
      LEFT JOIN blocks bl ON s.block_id = bl.id
      LEFT JOIN classrooms cl ON s.classroom_id = cl.id
      WHERE s.id = ?
    `).bind(userId);
    
    const result = await stmt.first();
    if (result) {
      result.academic_profile_completed = Boolean(
        result.academic_profile_completed &&
        result.roll_number &&
        result.college_id &&
        result.branch_id &&
        result.year &&
        result.section &&
        result.block_id &&
        (result.classroom_id || result.classroom_name)
      );
    }
    return result;
  } catch (e) {
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.roll_number, s.phone, s.email, s.avatar_url, s.academic_profile_completed,
             s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
             sec.name as section_name, s.block_id, s.classroom_id
      FROM students s
      LEFT JOIN sections sec ON s.section = sec.id
      WHERE s.id = ?
    `).bind(userId);
    
    const result = await stmt.first();
    if (result) {
      result.academic_profile_completed = Boolean(
        result.academic_profile_completed &&
        result.roll_number &&
        result.college_id &&
        result.branch_id &&
        result.year &&
        result.section &&
        result.block_id &&
        result.classroom_id
      );
    }
    return result;
  }
}

/**
 * Authoritative Server-side Verification for Academic Profile Completion
 * Blocks orders if profile is incomplete or missing any required delivery fields.
 */
export async function verifyStudentAcademicProfile(db, studentId) {
  if (!studentId) {
    return {
      valid: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to place orders.'
    };
  }

  const student = await getStudentByUserId(db, studentId);

  if (!student) {
    return {
      valid: false,
      error: 'PROFILE_COMPLETION_REQUIRED',
      message: 'Please provide your academic details before placing your first order. This helps us deliver your orders to the correct classroom.',
      missingFields: ['college', 'branch', 'year', 'section', 'block', 'classroom', 'roll_number']
    };
  }

  const missingFields = [];
  if (!student.college_id) missingFields.push('college');
  if (!student.branch_id) missingFields.push('branch');
  if (!student.year) missingFields.push('academic_year');
  if (!student.section) missingFields.push('section');
  if (!student.block_id) missingFields.push('block');
  if (!student.classroom_id && !student.classroom_name) missingFields.push('classroom');
  if (!student.roll_number || !student.roll_number.trim()) missingFields.push('roll_number');

  if (missingFields.length > 0 || !student.academic_profile_completed) {
    return {
      valid: false,
      error: 'PROFILE_COMPLETION_REQUIRED',
      message: 'Please provide your academic details before placing your first order. This helps us deliver your orders to the correct classroom.',
      missingFields,
      student
    };
  }

  return {
    valid: true,
    student
  };
}

export async function upsertStudent(db, studentData) {
  const { 
    id, 
    roll_number, 
    name, 
    phone, 
    email, 
    avatar_url,
    college_id, 
    branch_id, 
    study_year_id, 
    semester_id, 
    section, 
    block_id, 
    classroom_id 
  } = studentData;
  const now = Date.now();

  // Normalize and clean roll number
  const cleanRollNumber = roll_number ? roll_number.trim().toUpperCase() : null;

  // Uniqueness check for roll number
  if (cleanRollNumber) {
    const existingRoll = await db.prepare(
      'SELECT id FROM students WHERE UPPER(roll_number) = ? AND id != ?'
    ).bind(cleanRollNumber, id).first();

    if (existingRoll) {
      const err = new Error('This roll number is already registered by another student.');
      err.code = 'ROLL_NUMBER_DUPLICATE';
      throw err;
    }
  }

  // Resolve block name (e.g. 'A-BLOCK') to blocks.id if needed
  let finalBlockId = block_id || null;
  if (finalBlockId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalBlockId)) {
    const blRow = await db.prepare('SELECT id FROM blocks WHERE name = ? OR id = ?').bind(finalBlockId, finalBlockId).first();
    if (blRow) finalBlockId = blRow.id;
  }

  // Resolve section name (e.g. 'A', 'B', 'C') to sections.id if needed
  let finalSectionId = section || null;
  if (finalSectionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalSectionId)) {
    const secRow = await db.prepare('SELECT id FROM sections WHERE name = ? OR id = ?').bind(finalSectionId, finalSectionId).first();
    if (secRow) finalSectionId = secRow.id;
  }

  // Auto-create classroom if a manual string is provided instead of a UUID
  let finalClassroomId = classroom_id || null;
  if (finalClassroomId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalClassroomId)) {
    // Try to find existing classroom with this name in this block
    const existingClassroom = await db.prepare('SELECT id FROM classrooms WHERE name = ? AND block_id = ?').bind(finalClassroomId, finalBlockId).first();
    if (existingClassroom) {
      finalClassroomId = existingClassroom.id;
    } else {
      const newId = crypto.randomUUID();
      await db.prepare('INSERT INTO classrooms (id, name, block_id, status) VALUES (?, ?, ?, ?)')
        .bind(newId, finalClassroomId, finalBlockId, 'active').run();
      finalClassroomId = newId;
    }
  }

  // Compute profile completion status
  const isComplete = Boolean(
    cleanRollNumber &&
    college_id &&
    branch_id &&
    study_year_id &&
    finalSectionId &&
    finalBlockId &&
    finalClassroomId
  ) ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO students (
      id, roll_number, name, phone, email, avatar_url,
      college_id, branch_id, study_year_id, semester_id,
      section, block_id, classroom_id, academic_profile_completed,
      account_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      roll_number = excluded.roll_number,
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      avatar_url = COALESCE(excluded.avatar_url, students.avatar_url),
      college_id = excluded.college_id,
      branch_id = excluded.branch_id,
      study_year_id = excluded.study_year_id,
      semester_id = excluded.semester_id,
      section = excluded.section,
      block_id = excluded.block_id,
      classroom_id = excluded.classroom_id,
      academic_profile_completed = excluded.academic_profile_completed,
      updated_at = excluded.updated_at
    RETURNING id, name, roll_number, phone, email, avatar_url, college_id, branch_id,
              study_year_id as year, semester_id as semester, section, block_id, classroom_id,
              academic_profile_completed
  `).bind(
    id, 
    cleanRollNumber, 
    name, 
    phone, 
    email || null, 
    avatar_url || null,
    college_id, 
    branch_id, 
    study_year_id, 
    semester_id || 's_1', 
    finalSectionId || null, 
    finalBlockId || null, 
    finalClassroomId, 
    isComplete, 
    now, 
    now
  );

  const result = await stmt.first();
  if (result) {
    result.academic_profile_completed = Boolean(result.academic_profile_completed);
  }
  return result;
}
