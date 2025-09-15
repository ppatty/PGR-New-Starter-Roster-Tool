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
