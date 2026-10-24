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

test('FM status enables Apply, sends SSRC-scoped message, and confirms readback', () => {
  function element(value = '') {
    return {
      value, textContent:'', disabled:false, hidden:false, style:{},
      handlers:{}, addEventListener(kind, fn) { this.handlers[kind] = fn; },
      fire(kind) { if (this.handlers[kind]) this.handlers[kind](); }
    };
  }
  const nodes = {
    mode:element('fm'), fmSquelchControls:element(),
    fmSqOpen:element(), fmSqClose:element(), fmSqHysteresis:element(),
    fmSqApply:element(), fmSqStatus:element()
  };
  const commands = [];
  const client = {
    document:{ readyState:'complete', getElementById(id) { return nodes[id] || null; } },
    sendControl(...args) { commands.push(args); }
  };
  vm.runInNewContext(src, { window:client, Date }, { filename:'fm-squelch.js' });
  const ui = client.Ka9qFmSquelch;
  ui.onStatus(1, 10, 6);
  assert.equal(nodes.fmSqOpen.value, '10.0');
  assert.equal(nodes.fmSqClose.value, '6.0');
  assert.equal(nodes.fmSqHysteresis.value, '4.0');
  assert.equal(nodes.fmSqApply.disabled, true);
  nodes.fmSqHysteresis.value = '6';
  nodes.fmSqHysteresis.fire('input');
  assert.equal(nodes.fmSqClose.value, '4');
  assert.equal(nodes.fmSqApply.disabled, false);
  nodes.fmSqApply.fire('click');
  assert.equal(commands.length, 1);
  assert.equal(commands[0][1], 'Q:10.0:4.0');
  assert.match(nodes.fmSqStatus.textContent, /awaiting radiod readback/);
  ui.onStatus(1, 10, 4);
  assert.match(nodes.fmSqStatus.textContent, /confirmed by radiod/);
  nodes.mode.value = 'usb';
  nodes.mode.fire('change');
  assert.equal(nodes.fmSquelchControls.hidden, true);
  assert.equal(nodes.fmSqApply.disabled, true);
});
