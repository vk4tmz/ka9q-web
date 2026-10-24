# KA9Q Web Monitor — multi-channel passive browser monitor

Design / working checkpoint, 24 October 2026. This is a **new experimental
development branch** of `vk4tmz/ka9q-web`. It does not replace the existing
single-channel waterfall or alter any running `radiod` / AIS instance.

## Goal

Recreate the KA9Q `monitor` workflow in a browser, including **many simultaneous
audio streams**, per-channel gain/mute/solo/stereo pan, activity and SNR readouts,
plus a choice of **PCM** or **Opus** for network delivery when supported by the
bridge. Audio plays on the **browser's** selected sound device (e.g., devpc001),
not the remote machine hosting the receiver.

## Verified source behaviour (ka9q/ka9q-radio, main)

- `src/monitor.c` has one receive/mix session per RTP SSRC and accepts multiple
  multicast inputs; its PortAudio callback sums all active session buffers.
- `src/monitor.h` stores `pan` as a float in [-1,+1] and the text UI in
  `src/monitor-display.c` shows 100*pan, i.e. **-100..+100**.
- `src/monitor-data.c` applies left gain `gain*(1-pan)/2`, right gain
  `gain*(1+pan)/2`; it also delays the **less-favoured ear** by up to
  **1.5 ms**. `make_position` uses bit reversal for auto-position
  (0, -25, +25, -37.5, +12.5, ...).
- Channel status includes frequency, demod mode, SNR, signal level, gain, pan,
  active/total activity, queue/packet-loss metrics, encoder type and RTP source.
- KA9Q-Web already has a working browser PCM audio player and a bundled Opus
  decoder; the existing radio WebSocket is single-SSRC-per-session.

## Architectural choice: passive relay + browser mixer

[RX888 MkII on devlap200]
      |
   [radiod] -- multicast RTP audio + status
      |
      v
[web-monitor bridge on devlap200, **separate process**]
      |  (listen only; do not retune/reconfigure existing channels)
      |  WebSocket: subscribed RTP streams + status metadata
      v
[monitor.html on any LAN browser]
      |  one common AudioContext / jitter-aware per-SSRC streams
      |  per-channel decoding, gain, pan, mute, solo, channel labels
      v
[browser stereo output / optional headphones]

The bridge, initially run on **8084** for development, joins only explicitly
configured multicast groups. It discovers channels by `(source, SSRC)` to
avoid collisions, maintains latest status and RTP payload-format metadata and
forwards only channels each browser subscribes to. It must never rely on the
browser joining multicast: web browsers cannot open generic UDP multicast
sockets. Limit bridge exposure to the trusted LAN; add access controls before
exposing it elsewhere.

Each browser performs its own mix; one listener moving CH12 to the left must
not affect another browser or any existing `monitor` process. Receiver channel
configuration is **read-only by default** to avoid upsetting AIS / shared
receivers. Browser profiles can store subscribed SSRCs and pan/gain locally.

### Transport and codecs

- **PCM:** support negotiated RTP formats (at least mono S16), send compact
  frames with SSRC, format/sample rate, RTP sequence and timestamp.
- **Opus:** pass through the existing radiod Opus RTP payload when a given SSRC
  is already Opus. The browser creates one decoder state **per SSRC** and
  plays decoded PCM into the same mixer.
- **Requested codec selection:** offering *both* regardless of upstream encoding
  requires bridge-side transcoding. Do **not** change radiod's shared channel
  encoding just because a listener changes browser preference. Implement
  bridge-side PCM↔Opus conversion as a separate measured phase.
- Control/status use structured WebSocket text messages; audio uses binary
  packets with explicit version, source key, timestamp, encoding and payload.
  Reject unknown/unsupported codecs rather than playing mangled audio.
- Bound queues and drop tardy frames; never allow a slow browser to accumulate
  unbounded latency. Initial playout target ~100–200 ms, configurable.
- Handle squelch gaps, packet loss, Opus PLC, stream sample-rate changes and
  browser AudioContext suspension/recovery.

For scale, one 24ksps 16-bit mono PCM stream is 384 kbit/s before framing;
six such channels are ~2.3 Mbit/s. Opus voice is substantially smaller,
with actual bitrate to be measured on the receiving streams.

## Browser features — first end-to-end release

1. Scrollable, sortable table: name/SSRC, frequency, mode, SNR, power,
   streaming encoding, last activity, status and packet loss.
2. Subscribe/unsubscribe (do not create/change radiod channels), mute, solo,
   individual gain, pan [-100,+100] with center 0; master volume.
3. Activity indication and session health (stream age, underruns, queue depth).
4. Auto-position matching `monitor` bit-reversal and manual pan overrides.
5. A **Start audio** button for browser autoplay permission. Audio comes from
   the browser host's selected/default output, not devlap200.
6. Codec display/selection with explicit indication if transcoding is
   unavailable. Persist local per-browser settings.
7. Separate `monitor.html`; keep `radio.html` working unchanged.

## Sequencing and acceptance tests

- Phase 1: offline recorded/synthetic multi-SSRC RTP corpus; validate
  metadata discovery, SSRC routing, silence and packet loss, correct codec
  decoding and channel isolation.
- Phase 2: read-only bridge + live PCM on **8084**; establish 3+ concurrent
  channels, no radio restart, browser hears correct channels.
- Phase 3: browser stereo mixer, pan and 1.5-ms ear delay; compare against
  native `monitor` with the same source corpus. Verify CH12/CH16/CH73 can
  be independently placed and simultaneous transmissions remain intelligible.
- Phase 4: upstream-Opus passthrough and optional bridge transcoding;
  compare sound, bandwidth, CPU and end-to-end latency. Test two independent
  browser listeners with different pan/gain selections.
- Phase 5: harden reconnects, stream timeouts, slow clients, security,
  browser focus/background suspend, and local profile retention.

**Non-goals in the first release:** remote retuning or changing radiod gains,
full waterfall per channel, internet-facing exposure, or modifying existing
`monitor`/AIS session behaviour.

## Implementation checkpoint

`html/monitor-spatial.js` and `tests/test_monitor_spatial.cjs` establish
monitor-compatible auto pan and interaural gain/delay maths, with a reusable
Web Audio graph. **No live bridge or finished monitor page exists yet.**
