const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

test('smoke test', () => {
  assert.strictEqual(1, 1);
});

test('start times are no later than 19:00', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const match = html.match(/const RULES = {[\s\S]*?};/);
  assert.ok(match, 'RULES constant not found');
  const times = [...match[0].matchAll(/"(\d{2}:\d{2})"/g)].map(m => m[1]);
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    assert.ok(h < 19 || (h === 19 && m === 0), `${t} exceeds 19:00`);
  }
});

test('pickTime enforces 19:00 limit and provides safe fallbacks', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  const rulesMatch = html.match(/const RULES = {[\s\S]*?};/);
  assert.ok(rulesMatch, 'RULES definition not found');

  const pickTimeMatch = html.match(/function pickTime\(outlet, i\) {[\s\S]*?}(?:\r?\n|$)/);
  assert.ok(pickTimeMatch, 'pickTime function not found');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${rulesMatch[0]}\nthis.RULES = RULES;`, sandbox);
  vm.runInContext(`${pickTimeMatch[0]}\nthis.pickTime = pickTime;`, sandbox);

  const { RULES, pickTime } = sandbox;
  assert.ok(typeof pickTime === 'function', 'pickTime did not evaluate to a function');

  for (const outlet of Object.keys(RULES)) {
    for (let i = 0; i < 10; i++) {
      const time = pickTime(outlet, i);
      assert.ok(time <= '19:00', `${outlet} time ${time} exceeds 19:00`);
    }
  }

  RULES.TestOutlet = ['22:30', '18:45'];
  assert.strictEqual(pickTime('TestOutlet', 0), '18:45');

  RULES.AllLate = ['22:30'];
  assert.strictEqual(pickTime('AllLate', 0), '19:00');
});

test('default session days are set correctly', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  
  // Check Welcome Day defaults to Tuesday (value="2")
  const welcomeDayMatch = html.match(/<select id="welcomeDaySel">.*?<\/select>/s);
  assert.ok(welcomeDayMatch, 'Welcome Day selector not found');
  const welcomeDaySelected = welcomeDayMatch[0].match(/<option value="(\d)" selected>/);
  assert.ok(welcomeDaySelected, 'Welcome Day default not found');
  assert.strictEqual(welcomeDaySelected[1], '2', 'Welcome Day should default to Tuesday (value 2)');
  
  // Check PGR Onboarding defaults to Thursday (value="4")
  const onboardDayMatch = html.match(/<select id="onboardDaySel">.*?<\/select>/s);
  assert.ok(onboardDayMatch, 'PGR Onboarding selector not found');
  const onboardDaySelected = onboardDayMatch[0].match(/<option value="(\d)" selected>/);
  assert.ok(onboardDaySelected, 'PGR Onboarding default not found');
  assert.strictEqual(onboardDaySelected[1], '4', 'PGR Onboarding should default to Thursday (value 4)');
  
  // Check Elevate Training defaults to Wednesday (value="3")
  const elevateDayMatch = html.match(/<select id="elevateDaySel">.*?<\/select>/s);
  assert.ok(elevateDayMatch, 'Elevate Training selector not found');
  const elevateDaySelected = elevateDayMatch[0].match(/<option value="(\d)" selected>/);
  assert.ok(elevateDaySelected, 'Elevate Training default not found');
  assert.strictEqual(elevateDaySelected[1], '3', 'Elevate Training should default to Wednesday (value 3)');
});

test('birth date picker exposes a year selector', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="calendar-year"'), 'calendar year selector missing');
  assert.ok(html.includes('calendarYearSelect'), 'renderCalendar should reference calendar year selector');
  assert.ok(html.includes('setFullYear'), 'renderCalendar should update calendar year');
});

test('normalizeIsoDate accepts common formats and rejects invalid dates', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const pad2Match = html.match(/const pad2 =[^;]+;/);
  assert.ok(pad2Match, 'pad2 helper missing');
  const parseStart = html.indexOf('function parseIsoDate');
  const isValidStart = html.indexOf('function isValidIsoDate');
  const normalizeStart = html.indexOf('function normalizeIsoDate');
  const formatStart = html.indexOf('function formatInvalidStartDateMessage');
  assert.ok(parseStart !== -1, 'parseIsoDate helper missing');
  assert.ok(isValidStart !== -1, 'isValidIsoDate helper missing');
  assert.ok(normalizeStart !== -1, 'normalizeIsoDate helper missing');
  assert.ok(formatStart !== -1, 'formatInvalidStartDateMessage helper missing');
  const parseBlock = html.slice(parseStart, isValidStart);
  const isValidBlock = html.slice(isValidStart, normalizeStart);
  const normalizeBlock = html.slice(normalizeStart, formatStart);

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${pad2Match[0]}\n${parseBlock}\n${isValidBlock}\n${normalizeBlock}\nthis.normalizeIsoDate = normalizeIsoDate;\nthis.isValidIsoDate = isValidIsoDate;`, sandbox);

  const { normalizeIsoDate, isValidIsoDate } = sandbox;
  assert.strictEqual(normalizeIsoDate('2025-02-03'), '2025-02-03');
  assert.strictEqual(normalizeIsoDate('3/2/2025'), '2025-02-03');
  assert.strictEqual(normalizeIsoDate('31-04-2025'), '');
  assert.ok(isValidIsoDate('2025-02-03'));
  assert.ok(!isValidIsoDate('2025-02-30'));
});

test('training shift inputs are editable and include split controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const foodInput = html.match(/<input[^>]*id="blk_food"[^>]*>/);
  assert.ok(foodInput, 'Oasis Food input not found');
  assert.ok(!/disabled/.test(foodInput[0]), 'Training shift inputs should be editable');
  assert.ok(html.includes('id="splitTrainingBtn"'), 'Split training toggle missing');
  assert.ok(html.includes('id="splitPair_food"'), 'Split pairing selector missing');
  assert.ok(html.includes('id="splitPair_obar"'), 'Split pairing selector missing');
});
