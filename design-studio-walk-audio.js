/**
 * Design Studio walk — game SFX only (no background music)
 */
(function () {
  "use strict";

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let muted = false;
  let volume = 0.42;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);
    return ctx;
  }

  function start() {
    if (!ensureCtx()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  function stop() { /* no music to stop */ }

  function playTone(freq, dur, type, vol, slideTo) {
    if (!ensureCtx() || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function sfxInspect() {
    playTone(440, 0.12, "sine", 0.12, 880);
    setTimeout(() => playTone(660, 0.18, "triangle", 0.08), 60);
  }

  function sfxWaypoint() {
    playTone(220, 0.25, "sine", 0.1, 330);
  }

  function sfxRouteStart() {
    playTone(110, 0.4, "sawtooth", 0.08, 220);
    setTimeout(() => playTone(164.81, 0.5, "sine", 0.12, 329.63), 120);
    setTimeout(() => playTone(220, 0.7, "triangle", 0.1), 280);
  }

  function sfxFootstep() {
    playTone(80 + Math.random() * 20, 0.06, "sine", 0.025);
  }

  function toggleMute() {
    muted = !muted;
    return muted;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  function sfxQuestSuccess() {
    playTone(523.25, 0.15, "sine", 0.14, 783.99);
    setTimeout(() => playTone(659.25, 0.2, "triangle", 0.12, 987.77), 100);
    setTimeout(() => playTone(783.99, 0.35, "sine", 0.1), 220);
  }

  function sfxQuestFail() {
    playTone(180, 0.2, "sawtooth", 0.1, 120);
  }

  function isMuted() { return muted; }
  function isRunning() { return false; }

  window.__DS_WALK_AUDIO = {
    start,
    stop,
    toggleMute,
    setVolume,
    isMuted,
    isRunning,
    sfx: {
      inspect: sfxInspect, waypoint: sfxWaypoint, routeStart: sfxRouteStart,
      footstep: sfxFootstep, questSuccess: sfxQuestSuccess, questFail: sfxQuestFail
    }
  };
})();
