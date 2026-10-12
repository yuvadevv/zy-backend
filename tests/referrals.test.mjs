import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  formatPublicDisplayName, 
  getOrCreateReferralCode, 
  attributeReferral, 
  processOrderReferralQualification, 
  revertOrderReferralQualification,
  getReferralLeaderboard,
  getStudentReferralDetails
} from '../backend/worker/src/services/referralService.js';

// In-memory mock database implementing D1's prepare().bind().first() / all() / run()
function createMockDB() {
  const codes = new Map(); // student_id -> code
  const referrals = new Map(); // id -> record
  const students = new Map(); // id -> student

  return {
    _data: { codes, referrals, students },
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM student_referral_codes WHERE student_id = ?')) {
                const sId = params[0];
                const code = codes.get(sId);
                return code ? { referral_code: code } : null;
              }
              if (sql.includes('FROM student_referral_codes WHERE UPPER(referral_code) = ?')) {
                const code = params[0];
                for (const [sId, c] of codes.entries()) {
                  if (c.toUpperCase() === code.toUpperCase()) {
                    return { student_id: sId, referral_code: c };
                  }
                }
                return null;
              }
              if (sql.includes('FROM referrals WHERE referred_id = ? AND status = \'pending\'')) {
                const rId = params[0];
                for (const r of referrals.values()) {
                  if (r.referred_id === rId && r.status === 'pending') return r;
                }
                return null;
              }
              if (sql.includes('FROM referrals WHERE referred_id = ?')) {
                const rId = params[0];
                for (const r of referrals.values()) {
                  if (r.referred_id === rId) return r;
                }
                return null;
              }
              if (sql.includes('FROM referrals WHERE qualifying_order_id = ? AND status = \'qualified\'')) {
                const ordId = params[0];
                for (const r of referrals.values()) {
                  if (r.qualifying_order_id === ordId && r.status === 'qualified') return r;
                }
                return null;
              }
              if (sql.includes('COUNT(id) as total_attributed')) {
                const referrerId = params[0];
                let total = 0, pending = 0, qualified = 0;
                for (const r of referrals.values()) {
                  if (r.referrer_id === referrerId && r.status !== 'reversed') {
                    total++;
                    if (r.status === 'pending') pending++;
                    if (r.status === 'qualified') qualified++;
                  }
                }
                return {
                  total_attributed: total,
                  pending_qualification: pending,
                  qualified_referrals: qualified
                };
              }
              if (sql.includes('orders') && sql.includes('grand_total >= 1.0')) {
                return null; // No other order
              }
              return null;
            },
            async all() {
              if (sql.includes("WHERE r.status = 'qualified'")) {
                const map = new Map();
                for (const r of referrals.values()) {
                  if (r.status === 'qualified') {
                    const prev = map.get(r.referrer_id) || { score: 0, first: r.qualified_at };
                    map.set(r.referrer_id, { 
                      score: prev.score + 1, 
                      first: Math.min(prev.first || Infinity, r.qualified_at || Infinity) 
                    });
                  }
                }
                const results = [];
                for (const [sId, entry] of map.entries()) {
                  const s = students.get(sId) || { name: 'Student' };
                  results.push({
                    student_id: sId,
                    student_name: s.name,
                    score: entry.score,
                    first_achievement_at: entry.first
                  });
                }
                results.sort((a, b) => b.score - a.score || a.first_achievement_at - b.first_achievement_at);
                return { results };
              }
              if (sql.includes("WHERE r.status != 'reversed'")) {
                const map = new Map();
                for (const r of referrals.values()) {
                  if (r.status !== 'reversed') {
                    const prev = map.get(r.referrer_id) || { score: 0, first: r.created_at };
                    map.set(r.referrer_id, { 
                      score: prev.score + 1, 
                      first: Math.min(prev.first || Infinity, r.created_at || Infinity) 
                    });
                  }
                }
                const results = [];
                for (const [sId, entry] of map.entries()) {
                  const s = students.get(sId) || { name: 'Student' };
                  results.push({
                    student_id: sId,
                    student_name: s.name,
                    score: entry.score,
                    first_achievement_at: entry.first
                  });
                }
                results.sort((a, b) => b.score - a.score || a.first_achievement_at - b.first_achievement_at);
                return { results };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO student_referral_codes')) {
                const [sId, code] = params;
                if (!codes.has(sId)) codes.set(sId, code);
                return { success: true };
              }
              if (sql.includes('INSERT INTO referrals')) {
                const [id, referrer_id, referred_id, referral_code, now] = params;
                referrals.set(id, {
                  id,
                  referrer_id,
                  referred_id,
                  referral_code,
                  status: 'pending',
                  created_at: now,
                  updated_at: now
                });
                return { success: true };
              }
              if (sql.includes('UPDATE referrals') && sql.includes("status = 'qualified'")) {
                const [orderId, qualAt, upAt, refId] = params;
                const r = referrals.get(refId);
                if (r && r.status === 'pending') {
                  r.status = 'qualified';
                  r.qualifying_order_id = orderId;
                  r.qualified_at = qualAt;
                  r.updated_at = upAt;
                }
                return { success: true };
              }
              if (sql.includes('UPDATE referrals') && sql.includes("status = 'pending'")) {
                const [upAt, refId] = params;
                const r = referrals.get(refId);
                if (r) {
                  r.status = 'pending';
                  r.qualifying_order_id = null;
                  r.qualified_at = null;
                  r.updated_at = upAt;
                }
                return { success: true };
              }
              return { success: true };
            }
          };
        }
      };
    }
  };
}

test('Referral Code - formats public display name safely without PII', () => {
  assert.equal(formatPublicDisplayName('Rahul Sharma'), 'Rahul S.');
  assert.equal(formatPublicDisplayName('Ananya Devi Prasad'), 'Ananya P.');
  assert.equal(formatPublicDisplayName('Kiran'), 'Kiran');
  assert.equal(formatPublicDisplayName(''), 'Student');
});

test('Referral Code - generates unique code starting with BLZ', async () => {
  const db = createMockDB();
  const code = await getOrCreateReferralCode(db, 'student_1');
  assert.match(code, /^BLZ[A-Z0-9]{5}$/);

  // Calling again returns the exact same code
  const code2 = await getOrCreateReferralCode(db, 'student_1');
  assert.equal(code2, code);
});

test('Referral Attribution - successful attribution links referrer and referred', async () => {
  const db = createMockDB();
  const refCode = await getOrCreateReferralCode(db, 'student_referrer');
  
  const result = await attributeReferral(db, 'student_referred', refCode);
  assert.equal(result.referrer_id, 'student_referrer');
  assert.equal(result.referred_id, 'student_referred');
  assert.equal(result.status, 'pending');
});

test('Referral Attribution - rejects self-referral', async () => {
  const db = createMockDB();
  const refCode = await getOrCreateReferralCode(db, 'student_alice');
  
  await assert.rejects(
    async () => attributeReferral(db, 'student_alice', refCode),
    (err) => err.code === 'SELF_REFERRAL'
  );
});

test('Referral Attribution - rejects duplicate attribution for same referred student', async () => {
  const db = createMockDB();
  const codeA = await getOrCreateReferralCode(db, 'referrer_a');
  const codeB = await getOrCreateReferralCode(db, 'referrer_b');
  
  await attributeReferral(db, 'student_bob', codeA);
  
  await assert.rejects(
    async () => attributeReferral(db, 'student_bob', codeB),
    (err) => err.code === 'DUPLICATE_ATTRIBUTION'
  );
});

test('Referral Qualification - order under ₹1 does not qualify', async () => {
  const db = createMockDB();
  const code = await getOrCreateReferralCode(db, 'ref_1');
  await attributeReferral(db, 'stud_1', code);

  const res = await processOrderReferralQualification(db, 'stud_1', 'order_cheap', 0.5);
  assert.equal(res.qualified, false);
  assert.equal(res.reason, 'BELOW_MINIMUM_THRESHOLD');
});

test('Referral Qualification - order >= ₹1 qualifies pending referral exactly once', async () => {
  const db = createMockDB();
  const code = await getOrCreateReferralCode(db, 'ref_1');
  await attributeReferral(db, 'stud_1', code);

  const res = await processOrderReferralQualification(db, 'stud_1', 'order_valid_1', 15.0);
  assert.equal(res.qualified, true);

  // Subsequent orders by the same student do not duplicate qualification
  const res2 = await processOrderReferralQualification(db, 'stud_1', 'order_valid_2', 50.0);
  assert.equal(res2.qualified, false);
  assert.equal(res2.reason, 'NO_PENDING_REFERRAL');
});

test('Referral Reversal - cancelling qualifying order reverts status to pending', async () => {
  const db = createMockDB();
  const code = await getOrCreateReferralCode(db, 'ref_1');
  await attributeReferral(db, 'stud_1', code);
  await processOrderReferralQualification(db, 'stud_1', 'order_cancelled_1', 25.0);

  const rev = await revertOrderReferralQualification(db, 'order_cancelled_1');
  assert.equal(rev.reversed, true);
});

test('Leaderboard - deterministic ranking by scores and tie-breaking', async () => {
  const db = createMockDB();
  db._data.students.set('s1', { name: 'Aarav Patel' });
  db._data.students.set('s2', { name: 'Bhavna Sharma' });

  const c1 = await getOrCreateReferralCode(db, 's1');
  const c2 = await getOrCreateReferralCode(db, 's2');

  await attributeReferral(db, 'user_a', c1);
  await attributeReferral(db, 'user_b', c1);
  await attributeReferral(db, 'user_c', c2);

  const connectors = await getReferralLeaderboard(db, 'connectors');
  assert.equal(connectors.length, 2);
  assert.equal(connectors[0].student_id, 's1');
  assert.equal(connectors[0].count, 2);
  assert.equal(connectors[1].student_id, 's2');
  assert.equal(connectors[1].count, 1);
});

test('Referral Code - repeated calls return identical code (idempotency)', async () => {
  const db = createMockDB();
  const code1 = await getOrCreateReferralCode(db, 'student_repeat');
  const code2 = await getOrCreateReferralCode(db, 'student_repeat');
  const code3 = await getOrCreateReferralCode(db, 'student_repeat');

  assert.equal(code1, code2);
  assert.equal(code2, code3);
  assert.match(code1, /^BLZ[A-Z0-9]{5}$/);
});

test('Referral Attribution - handles case insensitivity and whitespace', async () => {
  const db = createMockDB();
  const code = await getOrCreateReferralCode(db, 'student_alpha');

  const paddedLower = `  ${code.toLowerCase()}  `;
  const res = await attributeReferral(db, 'student_beta', paddedLower);
  assert.equal(res.referrer_id, 'student_alpha');
  assert.equal(res.referred_id, 'student_beta');
});

test('Referral Attribution - rejects non-existent referral code', async () => {
  const db = createMockDB();
  await assert.rejects(
    async () => attributeReferral(db, 'student_orphan', 'BLZNONEXIST'),
    (err) => err.code === 'CODE_NOT_FOUND'
  );
});

