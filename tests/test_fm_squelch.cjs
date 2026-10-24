'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'html', 'fm-squelch.js'), 'utf8');
const root = {};
vm.runInNewContext(src, { window: root }, { filename: 'fm-squelch.js' });
const { calculate, valid } = root.Ka9qFmSquelch;
const plain = x => JSON.parse(JSON.stringify(x));
test('hysteresis is the difference between open and close thresholds', () => {
  assert.deepEqual(plain(calculate(10, 6, 4, 'close')), { open:10, close:6, hysteresis:4 });
});
test('changing open preserves hysteresis by adjusting close', () => {
  assert.deepEqual(plain(calculate(12, 6, 4, 'open')), { open:12, close:8, hysteresis:4 });
});
test('changing close recomputes hysteresis', () => {
  assert.deepEqual(plain(calculate(10, 7, 4, 'close')), { open:10, close:7, hysteresis:3 });
});
test('changing hysteresis recomputes close', () => {
  assert.deepEqual(plain(calculate(10, 6, 6, 'hysteresis')), { open:10, close:4, hysteresis:6 });
});
test('valid rejects inconsistent thresholds and illegal ranges', () => {
  assert.equal(valid(plain(calculate(10, 6, 4, 'close'))), true);
  assert.equal(valid(plain(calculate(5, 7, 4, 'close'))), false);
  assert.equal(valid(plain(calculate(41, 6, 4, 'open'))), false);
  assert.equal(valid(plain(calculate(10, -30, 40, 'close'))), false);
});
