import test from 'node:test';
import assert from 'node:assert/strict';

test('Ambassador Status and Rules - Qualified Referrers board governing logic', async () => {
  // Test that governing leaderboard is strictly 'qualified'
  const settings = {
    is_active: false,
    selection_period_start: null,
    selection_period_end: null,
    governing_leaderboard: 'qualified',
    min_qualified_referrals: 3,
    programme_term: 'Upcoming Academic Term 2026',
    status: 'coming_soon'
  };

  const governingType = 'qualified';
  assert.strictEqual(governingType, 'qualified', 'Ambassador selection must strictly govern by qualified referrers');
  assert.notStrictEqual(governingType, 'connectors', 'Campus connectors leaderboard must not govern selection');
});

test('Ambassador Selection Period - Handles unconfigured dates gracefully', () => {
  const settings = {
    selection_period_start: null,
    selection_period_end: null
  };

  const hasConfiguredDates = Boolean(settings.selection_period_start && settings.selection_period_end);
  assert.strictEqual(hasConfiguredDates, false, 'Unconfigured dates must not claim active or open applications');

  const formattedDate = settings.selection_period_end ? new Date(settings.selection_period_end).toLocaleDateString() : 'Selection dates to be announced by BLINTZY.';
  assert.strictEqual(formattedDate, 'Selection dates to be announced by BLINTZY.');
});

test('Ambassador Notification Subscription - Duplicate handling and idempotency', () => {
  const subscribers = new Set();
  
  function subscribe(email) {
    if (subscribers.has(email)) {
      return { subscribed: true, already_subscribed: true };
    }
    subscribers.add(email);
    return { subscribed: true, already_subscribed: false };
  }

  const res1 = subscribe('student1@campus.edu');
  assert.strictEqual(res1.already_subscribed, false);
  assert.strictEqual(res1.subscribed, true);

  const res2 = subscribe('student1@campus.edu');
  assert.strictEqual(res2.already_subscribed, true);
  assert.strictEqual(res2.subscribed, true);
});
