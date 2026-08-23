export async function getStudentByUserId(db, userId) {
  const stmt = db.prepare(`
    SELECT id, name, roll_number, phone, email, college_id, branch_id, study_year_id as year, semester_id as semester, section
    FROM students
    WHERE id = ?
  `).bind(userId);
  
  const result = await stmt.first();
  return result;
}

export async function upsertStudent(db, studentData) {
  const { id, roll_number, name, phone, email, college_id, branch_id, study_year_id, semester_id, section } = studentData;
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO students (id, roll_number, name, phone, email, college_id, branch_id, study_year_id, semester_id, section, account_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
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
      updated_at = excluded.updated_at
    RETURNING id, name, roll_number, phone, email, college_id, branch_id, study_year_id as year, semester_id as semester, section
  `).bind(
    id, roll_number, name, phone, email || null, college_id, branch_id, study_year_id, semester_id, section || null, now, now
  );

  const result = await stmt.first();
  return result;
}
