/*
 * FM squelch controls for the current ka9q-web audio SSRC.
 * Server and radiod are authoritative. No settings are sent automatically.
 * Hysteresis is not a separate backend value: H = Open - Close (all dB SNR).
 */
(function(root) {
  'use strict';
  const $ = id => root.document && root.document.getElementById(id);
  const state = { actual: null, demod: null, dirty: false, pending: null };
  const round = n => Math.round(n * 10) / 10;

  function calculate(open, close, hysteresis, changed) {
    open = Number(open); close = Number(close); hysteresis = Number(hysteresis);
    if (changed === 'open' || changed === 'hysteresis')
      close = round(open - hysteresis);
    else if (changed === 'close')
      hysteresis = round(open - close);
    return { open: round(open), close: round(close), hysteresis: round(hysteresis) };
  }
  function valid(x) {
    return [x.open, x.close, x.hysteresis].every(Number.isFinite) &&
      x.open >= 0 && x.open <= 40 && x.close >= -30 &&
      x.close <= 40 && x.close <= x.open &&
      x.hysteresis >= 0 && x.hysteresis <= 30 &&
      Math.abs(x.hysteresis - (x.open - x.close)) < 0.11;
  }
  function values() {
    return calculate($('fmSqOpen').value, $('fmSqClose').value,
                     $('fmSqHysteresis').value, '');
  }
  function writeValues(x) {
    $('fmSqOpen').value = x.open.toFixed(1);
    $('fmSqClose').value = x.close.toFixed(1);
    $('fmSqHysteresis').value = x.hysteresis.toFixed(1);
  }
  function message(s) { const el = $('fmSqStatus'); if (el) el.textContent = s; }
  function fmSelected() {
    const mode = $('mode');
    return mode && ['fm', 'wfm'].includes((mode.value || '').toLowerCase());
  }
  function backendFm() { return state.demod === 1 || state.demod === 2; }
  function refreshMode() {
    const group = $('fmSquelchControls'), button = $('fmSqApply');
    if (!group || !button) return;
    const visible = fmSelected();
    group.hidden = !visible;
    group.style.display = visible ? 'block' : 'none';
    button.disabled = !visible || !backendFm() || !state.actual ||
                      !state.dirty || !valid(values());
    if (visible && !backendFm()) message('Waiting for FM demodulator status');
  }
  function edit(changed) {
    const open = Number($('fmSqOpen').value), close = Number($('fmSqClose').value);
    const hys = Number($('fmSqHysteresis').value);
    const result = calculate(open, close, hys, changed);
    if (changed !== 'open') $('fmSqOpen').value = String(result.open);
    if (changed !== 'close') $('fmSqClose').value = String(result.close);
    if (changed !== 'hysteresis') $('fmSqHysteresis').value = String(result.hysteresis);
    state.dirty = true;
    message(valid(result) ? 'Edited — press Apply' : 'Invalid thresholds (Open 0–40, Close −30–40, Hysteresis 0–30 dB)');
    refreshMode();
  }
  function apply() {
    const x = values();
    if (!valid(x) || !fmSelected() || !backendFm() || !state.actual) {
      message('Cannot apply: check mode, backend status and threshold values');
      return;
    }
    if (typeof root.sendControl !== 'function') {
      message('WebSocket control unavailable'); return;
    }
    state.pending = { open: x.open, close: x.close, since: Date.now() };
    state.dirty = false;
    message('Sent — awaiting radiod readback');
    root.sendControl('squelch', 'Q:' + x.open.toFixed(1) + ':' + x.close.toFixed(1), undefined, true);
    refreshMode();
  }
  function onStatus(demod, open, close) {
    if (Number.isInteger(demod)) state.demod = demod;
    if (Number.isFinite(open) && Number.isFinite(close) && open >= -30 && close >= -30) {
      const actual = calculate(open, close, open - close, 'close');
      state.actual = actual;
      if (state.pending) {
        if (Math.abs(actual.open - state.pending.open) < 0.15 &&
            Math.abs(actual.close - state.pending.close) < 0.15) {
          state.pending = null;
          message('Applied — confirmed by radiod');
        } else if (Date.now() - state.pending.since > 8000) {
          state.pending = null;
          message('No matching radiod readback; settings may not have applied');
        }
      }
      if (!state.dirty && !state.pending) {
        writeValues(actual);
        if (!$('fmSqStatus').textContent.startsWith('Applied') &&
            !$('fmSqStatus').textContent.startsWith('No matching'))
          message('Radiod: Open ' + actual.open.toFixed(1) +
                  ' / Close ' + actual.close.toFixed(1) + ' dB');
      }
    }
    refreshMode();
  }
  function reset() {
    state.actual = null; state.demod = null;
    state.dirty = false; state.pending = null;
    const group = $('fmSquelchControls');
    if (group) message('Waiting for FM status');
    refreshMode();
  }
  function error(s) { state.pending = null; state.dirty = true; message('Receiver: ' + s); refreshMode(); }
  function init() {
    const btn = $('fmSqApply');
    if (!btn) return;
    ['open', 'close', 'hysteresis'].forEach(k => {
      const id = { open:'fmSqOpen', close:'fmSqClose', hysteresis:'fmSqHysteresis' }[k];
      const el = $(id);
      if (el) el.addEventListener('input', () => edit(k));
    });
    btn.addEventListener('click', apply);
    const mode = $('mode');
    if (mode) mode.addEventListener('change', refreshMode);
    refreshMode();
  }
  root.Ka9qFmSquelch = { calculate, valid, onStatus, refreshMode, reset, error };
  if (root.document) {
    if (root.document.readyState === 'loading')
      root.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : {});
