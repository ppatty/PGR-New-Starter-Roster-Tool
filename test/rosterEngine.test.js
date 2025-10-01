'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRoster,
  sanitizeStarters,
  DEFAULT_MIN_SHIFTS,
  MANDATORY_SESSIONS
} = require('../backend/rosterEngine');

test('buildRoster generates mandatory sessions and honours blackout days', () => {
  const starters = [
    { Name: 'Taylor Rivers', StartDate: '2025-01-07', blackoutDates: ['2025-01-09'] }
  ];

  const result = buildRoster({
    starters,
    blocks: {
      'Oasis Food': 1,
      'Oasis Bar': 0,
      'SOV South Floor': 3,
      'SOV North Floor': 0,
      'SOV South Bar': 0,
      'SOV Dining': 0
    },
    minShifts: 3
  });

  const rows = result.rows.filter((row) => row.Starter === 'Taylor Rivers');
  assert.equal(rows.length, MANDATORY_SESSIONS.length + 1);

  const mandatoryLabels = new Set(MANDATORY_SESSIONS.map((session) => session.label));
  for (const label of mandatoryLabels) {
    assert.ok(rows.some((row) => row.Outlet === label), `missing mandatory session ${label}`);
  }

  assert.ok(!rows.some((row) => row.Date === '2025-01-09'), 'scheduled on blackout date');
  assert.ok(rows.some((row) => row.Date === '2025-01-10'), 'did not reschedule after blackout');
});

test('sanitizeStarters validates required fields', () => {
  assert.throws(() => sanitizeStarters([]), /At least one starter/);
  assert.throws(() => sanitizeStarters([{ Name: 'No Date' }]), /missing StartDate/);

  const [sanitized] = sanitizeStarters([{ Name: 'Valid Starter', StartDate: '2025-02-04', blackoutDates: ['2025-02-05'] }]);
  assert.equal(sanitized.Name, 'Valid Starter');
  assert.equal(sanitized.blackoutDates.length, 1);
  assert.equal(sanitized.blackoutDates[0], '2025-02-05');
});

test('buildRoster defaults produce a summary with the starter count', () => {
  const starters = [
    { Name: 'Alex Johnson', StartDate: '2025-01-07' },
    { Name: 'Jordan Smith', StartDate: '2025-01-08' }
  ];

  const result = buildRoster({ starters });
  assert.ok(result.summary.includes('2 starter'), 'summary should include starter count');
  const alexRows = result.rows.filter((row) => row.Starter === 'Alex Johnson');
  assert.ok(alexRows.length >= DEFAULT_MIN_SHIFTS, 'Alex should receive the minimum number of shifts');
});
