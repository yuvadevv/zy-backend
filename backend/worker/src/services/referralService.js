// backend/worker/src/services/referralService.js

/**
 * Format a student's full name safely for public leaderboards
 * e.g. "Rahul Sharma" -> "Rahul S." (preserves privacy, no roll numbers or phones)
 */
export function formatPublicDisplayName(fullName) {
  if (!fullName) return 'Student';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

/**
 * Generates or retrieves an existing unique referral code for a student.
 * Format: BLZ + 5 clean alphanumeric characters (e.g. BLZ8X4P2)
 */
export async function getOrCreateReferralCode(db, studentId) {
  // 1. Check existing
  const existing = await db.prepare(
    'SELECT referral_code FROM student_referral_codes WHERE student_id = ?'
  ).bind(studentId).first();

  if (existing?.referral_code) {
    return existing.referral_code;
  }

  // 2. Generate unique code
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let attempts = 0;
  let code = '';

  while (attempts < 10) {
    attempts++;
    let randomPart = '';
    for (let i = 0; i < 5; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `BLZ${randomPart}`;

    // Verify uniqueness
    const clash = await db.prepare(
      'SELECT referral_code FROM student_referral_codes WHERE referral_code = ?'
    ).bind(code).first();

    if (!clash) break;
  }

  const now = Date.now();
  await db.prepare(
    'INSERT OR IGNORE INTO student_referral_codes (student_id, referral_code, created_at) VALUES (?, ?, ?)'
  ).bind(studentId, code, now).run();

  // Re-query to guarantee returning the authoritative database code in case of concurrent insert
  const persisted = await db.prepare(
    'SELECT referral_code FROM student_referral_codes WHERE student_id = ?'
  ).bind(studentId).first();

  return persisted?.referral_code || code;
}

/**
 * Retrieves the authenticated student's referral statistics and code.
 */
export async function getStudentReferralDetails(db, studentId, baseUrl = 'https://blintzy.in') {
  const code = await getOrCreateReferralCode(db, studentId);

  // Statistics
  const counts = await db.prepare(`
    SELECT 
      COUNT(id) as total_attributed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_qualification,
      SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_referrals
    FROM referrals 
    WHERE referrer_id = ? AND status != 'reversed'
  `).bind(studentId).first();

  const totalAttributed = counts?.total_attributed || 0;
  const pendingQualification = counts?.pending_qualification || 0;
  const qualifiedCount = counts?.qualified_referrals || 0;

  // Calculate current rankings
  let connectorRank = null;
  if (totalAttributed > 0) {
    const higherConnectors = await db.prepare(`
      SELECT COUNT(*) as rank_above FROM (
        SELECT referrer_id, COUNT(id) as cnt 
        FROM referrals 
        WHERE status != 'reversed' 
        GROUP BY referrer_id 
        HAVING cnt > ?
      )
    `).bind(totalAttributed).first();
    connectorRank = (higherConnectors?.rank_above || 0) + 1;
  }

  let qualifiedRank = null;
  if (qualifiedCount > 0) {
    const higherQualified = await db.prepare(`
      SELECT COUNT(*) as rank_above FROM (
        SELECT referrer_id, COUNT(id) as cnt 
        FROM referrals 
        WHERE status = 'qualified' 
        GROUP BY referrer_id 
        HAVING cnt > ?
      )
    `).bind(qualifiedCount).first();
    qualifiedRank = (higherQualified?.rank_above || 0) + 1;
  }

  // Canonical shareable link
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const referralLink = `${cleanBase}/signup?ref=${code}`;

  return {
    referral_code: code,
    referral_link: referralLink,
    stats: {
      total_attributed: totalAttributed,
      pending_qualification: pendingQualification,
      qualified_referrals: qualifiedCount,
      connector_rank: connectorRank,
      qualified_rank: qualifiedRank
    }
  };
}

/**
 * Attributes a referred student to a referrer via referral code.
 * Enforces:
 * - Valid referral code
 * - No self-referral
 * - No duplicate attribution (1 student can only be referred once)
 */
export async function attributeReferral(db, referredStudentId, rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    throw { status: 400, code: 'INVALID_CODE', message: 'A valid referral code is required.' };
  }

  const cleanCode = rawCode.trim().toUpperCase();

  // Find referrer
  const refRecord = await db.prepare(
    'SELECT student_id, referral_code FROM student_referral_codes WHERE UPPER(referral_code) = ?'
  ).bind(cleanCode).first();

  if (!refRecord) {
    throw { status: 404, code: 'CODE_NOT_FOUND', message: 'Invalid referral code.' };
  }

  const referrerId = refRecord.student_id;

  // Prevent self-referral
  if (referrerId === referredStudentId) {
    throw { status: 400, code: 'SELF_REFERRAL', message: 'You cannot use your own referral code.' };
  }

  // Check if referred student is already attributed
  const existing = await db.prepare(
    'SELECT id, referrer_id FROM referrals WHERE referred_id = ?'
  ).bind(referredStudentId).first();

  if (existing) {
    throw { status: 409, code: 'DUPLICATE_ATTRIBUTION', message: 'Student is already attributed to a referral.' };
  }

  const referralId = crypto.randomUUID();
  const now = Date.now();

  await db.prepare(`
    INSERT INTO referrals (id, referrer_id, referred_id, referral_code, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).bind(referralId, referrerId, referredStudentId, refRecord.referral_code, now, now).run();

  return {
    id: referralId,
    referrer_id: referrerId,
    referred_id: referredStudentId,
    status: 'pending',
    created_at: now
  };
}

/**
 * Idempotently qualifies a referral when the referred student completes an eligible paid order.
 * Requirement: Final eligible order value >= ₹1.0
 */
export async function processOrderReferralQualification(db, studentId, internalOrderId, finalOrderAmount) {
  if (!studentId || !internalOrderId) return { qualified: false, reason: 'MISSING_PARAMS' };
  
  const amount = Number(finalOrderAmount) || 0;
  if (amount < 1.0) {
    return { qualified: false, reason: 'BELOW_MINIMUM_THRESHOLD' };
  }

  // Find if this student has a pending referral
  const pendingRef = await db.prepare(
    "SELECT id, referrer_id FROM referrals WHERE referred_id = ? AND status = 'pending'"
  ).bind(studentId).first();

  if (!pendingRef) {
    return { qualified: false, reason: 'NO_PENDING_REFERRAL' };
  }

  const now = Date.now();

  // Atomically update referral record to qualified exactly once
  const updateResult = await db.prepare(`
    UPDATE referrals 
    SET status = 'qualified', qualifying_order_id = ?, qualified_at = ?, updated_at = ? 
    WHERE id = ? AND status = 'pending'
  `).bind(internalOrderId, now, now, pendingRef.id).run();

  return {
    qualified: true,
    referral_id: pendingRef.id,
    referrer_id: pendingRef.referrer_id
  };
}

/**
 * Handles reversals if an order is cancelled or refunded.
 */
export async function revertOrderReferralQualification(db, internalOrderId) {
  if (!internalOrderId) return { reversed: false };

  const qualifiedRef = await db.prepare(
    "SELECT id, referred_id FROM referrals WHERE qualifying_order_id = ? AND status = 'qualified'"
  ).bind(internalOrderId).first();

  if (!qualifiedRef) {
    return { reversed: false, reason: 'NOT_A_QUALIFYING_ORDER' };
  }

  // Check if referred student has any other paid, non-cancelled order >= ₹1
  const otherOrder = await db.prepare(`
    SELECT internal_id, created_at 
    FROM orders 
    WHERE student_id = ? 
      AND internal_id != ? 
      AND status NOT IN ('cancelled', 'refunded', 'failed') 
      AND payment_status = 'paid' 
      AND grand_total >= 1.0
    ORDER BY created_at ASC 
    LIMIT 1
  `).bind(qualifiedRef.referred_id, internalOrderId).first();

  const now = Date.now();

  if (otherOrder) {
    // Re-attribute to the other qualifying order
    await db.prepare(`
      UPDATE referrals 
      SET qualifying_order_id = ?, updated_at = ? 
      WHERE id = ?
    `).bind(otherOrder.internal_id, now, qualifiedRef.id).run();

    return { reversed: false, reattributed_to: otherOrder.internal_id };
  } else {
    // Revert status to pending so qualified count updates accurately
    await db.prepare(`
      UPDATE referrals 
      SET status = 'pending', qualifying_order_id = NULL, qualified_at = NULL, updated_at = ? 
      WHERE id = ?
    `).bind(now, qualifiedRef.id).run();

    return { reversed: true, referral_id: qualifiedRef.id };
  }
}

/**
 * Retrieves deterministic Leaderboard data:
 * - 'connectors': ranked by attributed registrations (status != 'reversed')
 * - 'qualified': ranked by qualifying orders (status = 'qualified')
 */
export async function getReferralLeaderboard(db, type = 'connectors', limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  if (type === 'qualified') {
    const rows = await db.prepare(`
      SELECT 
        s.id as student_id,
        s.name as student_name,
        c.name as college_name,
        b.name as branch_name,
        COUNT(r.id) as score,
        MIN(r.qualified_at) as first_achievement_at
      FROM referrals r
      JOIN students s ON r.referrer_id = s.id
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE r.status = 'qualified'
      GROUP BY s.id, s.name, c.name, b.name
      ORDER BY score DESC, first_achievement_at ASC, s.name ASC
      LIMIT ?
    `).bind(safeLimit).all();

    const results = (rows.results || []).map((row, index) => ({
      rank: index + 1,
      student_id: row.student_id,
      display_name: formatPublicDisplayName(row.student_name),
      college: row.college_name || 'Campus',
      branch: row.branch_name || 'Student',
      count: Number(row.score) || 0,
      achieved_at: row.first_achievement_at
    }));

    return results;
  }

  // Default: 'connectors' (attributed registrations)
  const rows = await db.prepare(`
    SELECT 
      s.id as student_id,
      s.name as student_name,
      c.name as college_name,
      b.name as branch_name,
      COUNT(r.id) as score,
      MIN(r.created_at) as first_achievement_at
    FROM referrals r
    JOIN students s ON r.referrer_id = s.id
    LEFT JOIN colleges c ON s.college_id = c.id
    LEFT JOIN branches b ON s.branch_id = b.id
    WHERE r.status != 'reversed'
    GROUP BY s.id, s.name, c.name, b.name
    ORDER BY score DESC, first_achievement_at ASC, s.name ASC
    LIMIT ?
  `).bind(safeLimit).all();

  const results = (rows.results || []).map((row, index) => ({
    rank: index + 1,
    student_id: row.student_id,
    display_name: formatPublicDisplayName(row.student_name),
    college: row.college_name || 'Campus',
    branch: row.branch_name || 'Student',
    count: Number(row.score) || 0,
    achieved_at: row.first_achievement_at
  }));

  return results;
}
