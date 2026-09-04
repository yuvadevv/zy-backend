export async function getFilters(db) {
  const branchesStmt = db.prepare('SELECT id, name, code FROM branches');
  const yearsStmt = db.prepare('SELECT id, label, value FROM academic_years');
  const semestersStmt = db.prepare('SELECT id, academic_year_id, label, value FROM semesters');
  const subjectsStmt = db.prepare('SELECT id, branch_id, semester_id, name, code FROM subjects');

  const [branches, academicYears, semesters, subjects] = await db.batch([
    branchesStmt,
    yearsStmt,
    semestersStmt,
    subjectsStmt
  ]);

  return {
    branches: branches.results,
    academicYears: academicYears.results,
    semesters: semesters.results,
    subjects: subjects.results
  };
}

export async function getManuals(db, params = {}) {
  let query = `
    SELECT 
      m.id, 
      m.title as name, 
      m.subject_id, 
      s.branch_id, 
      sem.academic_year_id as year_id, 
      s.semester_id, 
      m.description, 
      m.pages, 
      m.base_price, 
      m.stock,
      m.availability_status as availability 
    FROM manuals m
    JOIN subjects s ON m.subject_id = s.id
    JOIN semesters sem ON s.semester_id = sem.id
    WHERE m.availability_status IN ('available', 'in_stock')
  `;
  
  const bindings = [];

  if (params.branchId) {
    query += ` AND s.branch_id = ?`;
    bindings.push(params.branchId);
  }
  
  if (params.studyYearId) {
    query += ` AND sem.academic_year_id = ?`;
    bindings.push(params.studyYearId);
  }
  
  if (params.semesterId) {
    query += ` AND s.semester_id = ?`;
    bindings.push(params.semesterId);
  }

  if (params.subjectId) {
    query += ` AND m.subject_id = ?`;
    bindings.push(params.subjectId);
  }

  if (params.search) {
    query += ` AND (LOWER(m.title) LIKE ? OR LOWER(m.description) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ?)`;
    const searchPattern = `%${params.search.toLowerCase()}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const stmt = db.prepare(query).bind(...bindings);
  const { results } = await stmt.all();
  return results;
}

export async function getManualById(db, id) {
  const query = `
    SELECT 
      m.id, 
      m.title as name, 
      m.subject_id, 
      s.branch_id, 
      sem.academic_year_id as year_id, 
      s.semester_id, 
      m.description, 
      m.pages, 
      m.base_price, 
      m.stock,
      m.availability_status as availability 
    FROM manuals m
    JOIN subjects s ON m.subject_id = s.id
    JOIN semesters sem ON s.semester_id = sem.id
    WHERE m.id = ? AND m.availability_status IN ('available', 'in_stock')
  `;
  
  const stmt = db.prepare(query).bind(id);
  const result = await stmt.first();
  return result;
}
