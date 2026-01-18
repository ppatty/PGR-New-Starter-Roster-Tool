'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRoster,
  sanitizeStarters,
  DEFAULT_MIN_SHIFTS,
  DEFAULT_BLOCKS,
  MANDATORY_SESSIONS
} = require('../backend/rosterEngine');

test('buildRoster generates mandatory sessions and honours blackout days', () => {
  const starters = [
    { Name: 'Taylor Rivers', StartDate: '2025-01-07', blackoutDates: ['2025-01-11'] }
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
    minShifts: 4
  });

  const rows = result.rows.filter((row) => row.Starter === 'Taylor Rivers');
  assert.equal(rows.length, MANDATORY_SESSIONS.length + 1);

  const mandatoryLabels = new Set(MANDATORY_SESSIONS.map((session) => session.label));
  for (const label of mandatoryLabels) {
    assert.ok(rows.some((row) => row.Outlet === label), `missing mandatory session ${label}`);
  }

  assert.ok(!rows.some((row) => row.Date === '2025-01-11'), 'scheduled on blackout date');
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

test('sanitizeStarters handles optional birth date field', () => {
  const startersWithBirthDate = [
    { Name: 'Alice Smith', StartDate: '2025-01-10', BirthDate: '1995-03-15' }
  ];
  const [sanitized] = sanitizeStarters(startersWithBirthDate);
  assert.equal(sanitized.Name, 'Alice Smith');
  assert.equal(sanitized.BirthDate, '1995-03-15');

  const startersWithoutBirthDate = [
    { Name: 'Bob Jones', StartDate: '2025-01-11' }
  ];
  const [sanitized2] = sanitizeStarters(startersWithoutBirthDate);
  assert.equal(sanitized2.Name, 'Bob Jones');
  assert.equal(sanitized2.BirthDate, '');

  assert.throws(() => sanitizeStarters([
    { Name: 'Invalid Birth', StartDate: '2025-01-12', BirthDate: 'not-a-date' }
  ]), /Invalid ISO date string/);
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

test('default training shifts total five and run for eight hours', () => {
  const totalBlocks = Object.values(DEFAULT_BLOCKS).reduce((sum, value) => sum + value, 0);
  assert.equal(totalBlocks, 5, 'default blocks should total five training shifts');
  assert.equal(DEFAULT_MIN_SHIFTS, MANDATORY_SESSIONS.length + 5);

  const starters = [{ Name: 'Morgan Lee', StartDate: '2025-01-09' }];
  const result = buildRoster({ starters, blocks: DEFAULT_BLOCKS, minShifts: MANDATORY_SESSIONS.length + 5 });
  const mandatoryLabels = new Set(MANDATORY_SESSIONS.map((session) => session.label));
  const trainingRow = result.rows.find((row) => !mandatoryLabels.has(row.Outlet));
  assert.ok(trainingRow, 'expected at least one training shift');

  const [startH, startM] = trainingRow.Start.split(':').map(Number);
  const [endH, endM] = trainingRow.End.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
  assert.equal(duration, 8 * 60, 'training shift should be 8 hours long');
});
