const test = require('node:test');
const assert = require('node:assert');

test('smoke test', () => {
  assert.strictEqual(1, 1);
});

test('start times are no later than 20:00', () => {
  const fs = require('node:fs');
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
  const fs = require('node:fs');
  const vm = require('node:vm');
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
      assert.ok(time <= '20:00', `${outlet} time ${time} exceeds 20:00`);
    }
  }

  RULES.TestOutlet = ['22:30', '19:45'];
  assert.strictEqual(pickTime('TestOutlet', 0), '19:45');

  RULES.AllLate = ['22:30'];
  assert.strictEqual(pickTime('AllLate', 0), '20:00');
});
