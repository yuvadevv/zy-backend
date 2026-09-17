export async function getStudentByUserId(db, userId) {
  try {
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.roll_number, s.phone, s.email,
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
    return result;
  } catch (e) {
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.roll_number, s.phone, s.email, s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section, sec.name as section_name, s.block_id, s.classroom_id
      FROM students s
      LEFT JOIN sections sec ON s.section = sec.id
      WHERE s.id = ?
    `).bind(userId);
    
    const result = await stmt.first();
    return result;
  }
}

export async function upsertStudent(db, studentData) {
  const { id, roll_number, name, phone, email, college_id, branch_id, study_year_id, semester_id, section, block_id, classroom_id } = studentData;
  const now = Date.now();

  // Auto-create classroom if a manual string is provided instead of a UUID
  let finalClassroomId = classroom_id || null;
  if (finalClassroomId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalClassroomId)) {
    // Try to find existing classroom with this name in this block
    const existingClassroom = await db.prepare('SELECT id FROM classrooms WHERE name = ? AND block_id = ?').bind(finalClassroomId, block_id).first();
    if (existingClassroom) {
      finalClassroomId = existingClassroom.id;
    } else {
      const newId = crypto.randomUUID();
      await db.prepare('INSERT INTO classrooms (id, name, block_id, status) VALUES (?, ?, ?, ?)')
        .bind(newId, finalClassroomId, block_id, 'active').run();
      finalClassroomId = newId;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO students (id, roll_number, name, phone, email, college_id, branch_id, study_year_id, semester_id, section, block_id, classroom_id, account_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      roll_number = excluded.roll_number,
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      college_id = excluded.college_id,
      branch_id = excluded.branch_id,
      study_year_id = excluded.study_year_id,
      semester_id = excluded.semester_id,
      section = excluded.section,
      block_id = excluded.block_id,
      classroom_id = excluded.classroom_id,
      updated_at = excluded.updated_at
    RETURNING id, name, roll_number, phone, email, college_id, branch_id, study_year_id as year, semester_id as semester, section, block_id, classroom_id
  `).bind(
    id, roll_number, name, phone, email || null, college_id, branch_id, study_year_id, semester_id, section || null, block_id || null, finalClassroomId, now, now
  );

  const result = await stmt.first();
  return result;
}
