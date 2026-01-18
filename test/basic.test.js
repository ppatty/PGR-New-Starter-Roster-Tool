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

test('competency template maps to starters and exports rows', () => {
  const bundle = JSON.parse(fs.readFileSync('data/pgr_competency_checklist_bundle.json', 'utf8'));
  assert.ok(bundle.template, 'bundle template missing');
  assert.ok(bundle.dataset, 'bundle dataset missing');
  const template = bundle.template;
  const dataset = bundle.dataset;
  const html = fs.readFileSync('index.html', 'utf8');
  const blockMatch = html.match(/const competencyTools = {};[\s\S]*?window.__competencyTools = competencyTools;/);
  assert.ok(blockMatch, 'competency helper block not found');

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  const helperPrelude = `
    const pad2 = n => (n < 10 ? '0' : '') + n;
    const parseYMD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const toDMY = d => pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  `;
  vm.runInContext(helperPrelude + blockMatch[0], sandbox);
  const tools = sandbox.window.__competencyTools;
  assert.ok(tools, 'competency tools were not exposed');
  assert.strictEqual(typeof tools.mapTemplateToStarter, 'function');
  assert.strictEqual(typeof tools.flattenChecklistCollection, 'function');

  const starters = [
    { Name: 'Dakota Parata', StaffID: '123456', StartDate: '2025-02-03' },
    { Name: 'Jordan Test', StaffID: '999999', StartDate: '2025-03-01' }
  ];

  const datasetOverrides = new Map([
    ['123456', {
      role: 'Private Gaming Host',
      mentor: 'Jordan Rivers',
      competencies: {
        'ensure-grooming-is-up-to-standard-name-badge-id-card': { status: 'Complete', completedOn: '2025-02-03' },
        'swipe-on-at-the-correct-swiping-station': { status: 'In Progress' }
      },
      notes: 'Shadow Jordan for first Sovereign shift.'
    }]
  ]);

  const checklistMap = new Map();
  for (const starter of starters) {
    const entry = datasetOverrides.get(starter.StaffID) || {};
    const checklist = tools.mapTemplateToStarter(template, starter, entry, dataset.defaults || {});
    assert.ok(checklist, 'checklist not generated');
    assert.strictEqual(checklist.sections.length, template.sections.length, 'section count mismatch');
    checklistMap.set(starter.StaffID, checklist);
  }

  const dakotaChecklist = checklistMap.get('123456');
  const mentorMeta = dakotaChecklist.metadata.find(entry => entry.key === 'mentor');
  assert.ok(mentorMeta, 'mentor metadata missing');
  assert.strictEqual(mentorMeta.value, 'Jordan Rivers');
  const groomingItem = dakotaChecklist.sections[0].items.find(item => item.id === 'ensure-grooming-is-up-to-standard-name-badge-id-card');
  assert.ok(groomingItem, 'expected grooming item missing');
  assert.strictEqual(groomingItem.status, 'Complete');

  const fallbackChecklist = checklistMap.get('999999');
  const fallbackMentorMeta = fallbackChecklist.metadata.find(entry => entry.key === 'mentor');
  assert.ok(fallbackMentorMeta, 'fallback mentor metadata missing');
  assert.strictEqual(fallbackMentorMeta.value, dataset.defaults.mentor || '');
  const fallbackFirstItem = fallbackChecklist.sections[0].items[0];
  assert.strictEqual(fallbackFirstItem.status, template.sections[0].items[0].defaultStatus || template.defaultStatus, 'default status not applied');

  const rows = tools.flattenChecklistCollection(checklistMap);
  const expectedRowCount = starters.length * template.sections.reduce((sum, section) => sum + (section.items || []).length, 0);
  assert.strictEqual(rows.length, expectedRowCount, 'flattenChecklistCollection produced unexpected row count');

  const dakotaRow = rows.find(row => row.Name === 'Dakota Parata' && row.Item.includes('Ensure grooming'));
  assert.ok(dakotaRow, 'expected Dakota row missing');
  assert.strictEqual(dakotaRow.Status, 'Complete');
});

test('PGR static checklist builds individualized sheets', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const blockMatch = html.match(/const competencyTools = {};[\s\S]*?window.__competencyTools = competencyTools;/);
  assert.ok(blockMatch, 'competency helper block not found');

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  const helperPrelude = `
    const pad2 = n => (n < 10 ? '0' : '') + n;
    const parseYMD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const toDMY = d => pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  `;
  vm.runInContext(helperPrelude + blockMatch[0], sandbox);
  const tools = sandbox.window.__competencyTools;
  assert.ok(tools, 'competency tools not exposed');
  assert.strictEqual(typeof tools.normalizePgrChecklist, 'function', 'normalize function missing');
  assert.strictEqual(typeof tools.buildStaticChecklistSheet, 'function', 'builder function missing');

  const raw = JSON.parse(fs.readFileSync('pgr_competency_checklist.json', 'utf8'));
  const normalized = tools.normalizePgrChecklist(raw);
  assert.ok(Array.isArray(normalized.sections), 'normalized sections missing');
  const startingShift = normalized.sections.find(section => section.category === 'Starting Shift');
  assert.ok(startingShift, 'starting shift section missing');
  assert.ok(startingShift.items.some(item => /grooming/i.test(item.label)), 'expected starting shift item missing');

  const starter = { Name: 'Test User', StaffID: 'T123', StartDate: '2025-05-01' };
  const { sheetRows, overviewRows } = tools.buildStaticChecklistSheet(normalized, starter, 0);
  assert.ok(sheetRows.length > 5, 'sheet rows unexpectedly short');
  const teamRow = sheetRows.find(row => Array.isArray(row) && row[0] === 'Team Member');
  assert.ok(teamRow, 'team member row missing');
  assert.strictEqual(teamRow[1], 'Test User', 'team member not populated');
  const headerRowIndex = sheetRows.findIndex(row => Array.isArray(row) && row[0] === 'Category');
  assert.ok(headerRowIndex !== -1, 'header row missing');
  assert.ok(Array.isArray(sheetRows[headerRowIndex + 1]) && sheetRows[headerRowIndex + 1][2], 'first checklist item missing');
  assert.ok(Array.isArray(overviewRows), 'overview rows missing');
  assert.ok(overviewRows.length >= startingShift.items.length, 'overview rows shorter than expected');
  assert.ok(overviewRows.some(row => /Ensure grooming/i.test(row.Item)), 'overview rows missing grooming item');
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
  const renderCalendarBlock = html.match(/function renderCalendar\(\)[\s\S]*?function closeCalendarModal/);
  assert.ok(renderCalendarBlock, 'renderCalendar function not found');
  assert.ok(renderCalendarBlock[0].includes('calendarYearSelect'), 'renderCalendar should reference calendar year selector');
  assert.ok(renderCalendarBlock[0].includes('setFullYear'), 'renderCalendar should update calendar year');
});

test('training shift inputs are editable and include split controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const foodInput = html.match(/<input[^>]*id="blk_food"[^>]*>/);
  assert.ok(foodInput, 'Oasis Food input not found');
  assert.ok(!/disabled/.test(foodInput[0]), 'Training shift inputs should be editable');
  assert.ok(html.includes('id="splitTrainingBtn"'), 'Split training toggle missing');
  assert.ok(html.includes('id="splitPrimaryOutlet"'), 'Split primary outlet selector missing');
  assert.ok(html.includes('id="splitSecondaryOutlet"'), 'Split secondary outlet selector missing');
});
