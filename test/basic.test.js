const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

test('smoke test', () => {
  assert.strictEqual(1, 1);
});

test('start times are no later than 20:00', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const match = html.match(/const RULES = {[\s\S]*?};/);
  assert.ok(match, 'RULES constant not found');
  const times = [...match[0].matchAll(/"(\d{2}:\d{2})"/g)].map(m => m[1]);
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    assert.ok(h < 20 || (h === 20 && m === 0), `${t} exceeds 20:00`);
  }
});

test('pickTime enforces 20:00 limit and provides safe fallbacks', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  const rulesMatch = html.match(/const RULES = {[\s\S]*?};/);
  assert.ok(rulesMatch, 'RULES definition not found');

  const pickTimeMatch = html.match(/function pickTime\(outlet, i\) {[\s\S]*?}\n/);
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
      assert.ok(time <= '20:00', `${outlet} time ${time} exceeds 20:00`);
    }
  }

  RULES.TestOutlet = ['22:30', '19:45'];
  assert.strictEqual(pickTime('TestOutlet', 0), '19:45');

  RULES.AllLate = ['22:30'];
  assert.strictEqual(pickTime('AllLate', 0), '20:00');
});

test('competency template maps to starters and exports rows', () => {
  const bundle = JSON.parse(fs.readFileSync('data/pgr_competency_checklist.json', 'utf8'));
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

  const checklistMap = new Map();
  for (const starter of starters) {
    const entry = dataset.people.find(p => (p.staffId || '').toLowerCase() === starter.StaffID.toLowerCase()) || {};
    const checklist = tools.mapTemplateToStarter(template, starter, entry, dataset.defaults || {});
    assert.ok(checklist, 'checklist not generated');
    assert.strictEqual(checklist.sections.length, template.sections.length, 'section count mismatch');
    checklistMap.set(starter.StaffID, checklist);
  }

  const dakotaChecklist = checklistMap.get('123456');
  const mentorItem = dakotaChecklist.sections
    .flatMap(section => section.items)
    .find(item => item.id === 'mentor-intro');
  assert.ok(mentorItem, 'mentor item missing');
  assert.ok(/Jordan Rivers/.test(mentorItem.label), 'mentor placeholder not resolved');
  assert.strictEqual(mentorItem.status, 'Signed Off', 'mentor status should reflect Signed Off option');
  const welcomeItem = dakotaChecklist.sections[0].items.find(item => item.id === 'welcome-day');
  assert.strictEqual(welcomeItem.status, 'Complete');

  const fallbackChecklist = checklistMap.get('999999');
  const fallbackStatus = fallbackChecklist.sections[0].items[1].status;
  assert.strictEqual(fallbackStatus, template.sections[0].items[1].defaultStatus || template.defaultStatus, 'default status not applied');

  const rows = tools.flattenChecklistCollection(checklistMap);
  const expectedRowCount = starters.length * template.sections.reduce((sum, section) => sum + (section.items || []).length, 0);
  assert.strictEqual(rows.length, expectedRowCount, 'flattenChecklistCollection produced unexpected row count');

  const dakotaRow = rows.find(row => row.Name === 'Dakota Parata' && row.Item.includes('Attend Welcome Day'));
  assert.ok(dakotaRow, 'expected Dakota row missing');
  assert.strictEqual(dakotaRow.Status, 'Complete');
});
