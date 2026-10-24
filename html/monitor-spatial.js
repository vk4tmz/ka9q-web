/* Browser-side spatial positioning matching ka9q-radio/src/monitor-data.c.
 * This file is a reusable foundation, not yet the network audio receiver.
 */
(function(root) {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // Same bit-reversed 8-bit sequence as make_position(int) in monitor-data.c:
  // 0, -25, +25, -37.5, +12.5, -12.5, +37.5, ...
  function automaticPan(index) {
    if (!Number.isInteger(index) || index < 0 || index > 254)
      throw new RangeError('auto pan index must be an integer 0..254');
    let value = index + 1, reversed = 0;
    for (let i = 0; i < 8; i++) {
      reversed = (reversed << 1) | (value & 1);
      value >>= 1;
    }
    return 0.5 * (reversed / 128 - 1);
  }

  // Pan is expressed like monitor's display: -100 (left) to +100 (right).
  // The local browser mix deliberately does not alter radiod's channel gain.
  function panCoefficients(panPercent, gain = 1, sampleRate = 48000) {
    if (![panPercent, gain, sampleRate].every(Number.isFinite) ||
        sampleRate <= 0 || gain < 0)
      throw new RangeError('invalid spatial pan, gain, or sample rate');
    const pan = clamp(panPercent / 100, -1, 1);
    return {
      pan,
      leftGain: gain * (1 - pan) / 2,
      rightGain: gain * (1 + pan) / 2,
      leftDelaySeconds: pan > 0 ? pan * 0.0015 : 0,
      rightDelaySeconds: pan < 0 ? -pan * 0.0015 : 0,
      leftDelaySamples: pan > 0 ? Math.round(pan * 0.0015 * sampleRate) : 0,
      rightDelaySamples: pan < 0 ? Math.round(-pan * 0.0015 * sampleRate) : 0
    };
  }

  // Mono input -> individual left/right gain and short opposing-ear delay ->
  // stereo merger -> caller-owned master bus. Uses ONE shared AudioContext.
  function createSpatialChannel(audioContext, monoInput, mixBus, initialPan=0, initialGain=1) {
    if (!audioContext || typeof audioContext.createGain !== 'function' ||
        typeof audioContext.createDelay !== 'function' ||
        typeof audioContext.createChannelMerger !== 'function' ||
        !monoInput || !mixBus)
      throw new TypeError('Web Audio context, source and output bus are required');
    const left = audioContext.createGain(), right = audioContext.createGain();
    const leftDelay = audioContext.createDelay(0.002);
    const rightDelay = audioContext.createDelay(0.002);
    const merge = audioContext.createChannelMerger(2);
    monoInput.connect(left);
    monoInput.connect(right);
    left.connect(leftDelay);
    right.connect(rightDelay);
    leftDelay.connect(merge, 0, 0);
    rightDelay.connect(merge, 0, 1);
    merge.connect(mixBus);

    let currentPan = initialPan, currentGain = initialGain;
    function set(pan=currentPan, gain=currentGain) {
      const v = panCoefficients(pan, gain, audioContext.sampleRate);
      currentPan = pan;
      currentGain = gain;
      const now = audioContext.currentTime;
      // 5ms smoothing minimizes clicks when channels are moved mid-transmission.
      const smooth = (param, value) => {
        if (param && typeof param.setTargetAtTime === 'function')
          param.setTargetAtTime(value, now, 0.005);
        else if (param) param.value = value;
      };
      smooth(left.gain, v.leftGain);
      smooth(right.gain, v.rightGain);
      smooth(leftDelay.delayTime, v.leftDelaySeconds);
      smooth(rightDelay.delayTime, v.rightDelaySeconds);
      return v;
    }
    set(initialPan, initialGain);
    return {
      set,
      disconnect() {
        for (const node of [left,right,leftDelay,rightDelay,merge])
          node.disconnect();
        // monoInput can be shared with other nodes, so do not disconnect it.
      }
    };
  }

  root.Ka9qMonitorSpatial = {automaticPan, panCoefficients, createSpatialChannel};
})(typeof window !== 'undefined' ? window : {});
