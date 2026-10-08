/* Thunder Guard — rework per 9-expert office-hours review (feat/thunder-guard-rework).
   Explicit state machine:
     STAND -> FOLLOW -> FLY_LAP -> IDLE_JAZZ -> SMASH_WINDUP -> SMASH_IMPACT -> SMASH_RECOVER -> (FOLLOW|STAND)
   Follow-the-cursor is wired (was dead code). Click = hammer raise + Stormbreaker smash.
   Idle 2s/8s/20s -> tiered "jazz" antics. All art + audio original (inspired-by only). */
(function () {
  "use strict";
  if (window.__thunderGuard) {
    try { window.__thunderGuard.destroy(); } catch (e) { /* replace a hot reload */ }
  }

  var scriptSrc = document.currentScript && document.currentScript.src;
  var asset = function (name) {
    return scriptSrc ? new URL(name, scriptSrc).href : "assets/" + name;
  };

  /* ---------- frozen tunables (review §2: one CONFIG, no magic numbers) ---------- */
  var CONFIG = Object.freeze({
    sizeVar: Object.freeze({ fly: "--tg-fly", stand: "--tg-stand", smash: "--tg-smash", clip: "--tg-clip" }),
    sizeFallback: Object.freeze({ fly: 104, stand: 128, smash: 190, clip: 260 }),
    sizeCap: Object.freeze({ fly: [0.24, 0], stand: [0.26, 0.30], smash: [0.42, 0.40], clip: [0.46, 0.50] }), // [vw, vh]
    follow: Object.freeze({ pull: 0.030, drag: 0.74, vmax: 30, bankK: 1.35, bankMax: 22, flipThresh: 2.4, flipDebounce: 150, offX: 56, offY: 68, deadR: 26, driftAmp: 18, driftHz: 0.25, stillMs: 2500 }),
    smash: Object.freeze({ cooldownMs: 1600, spamWindowMs: 2000, spamCount: 3, throttleMs: 3000, shakeMs: 450 }),
    jazz: Object.freeze({ t1: 2000, t2: 8000, t3: 20000, copyCdMs: 120000, budgetPerMin: 4 }),
    idleAudio: Object.freeze({ rumbleMin: 9000, rumbleMax: 15000, tickMin: 1200, tickMax: 3500, gain: 0.30 }),
    sleepMs: 1000
  });

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function quad(a, b, c, t) { var u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- sprites (stand eager; fly/smash lazy via decode) ---------- */
  var poses = {
    fly: { img: new Image(), aspect: 560 / 379 },
    smash: { img: new Image(), aspect: 593 / 640 },
    stand: { img: new Image(), aspect: 1102 / 1700 }
  };
  poses.fly.img.decoding = "async";
  poses.smash.img.decoding = "async";
  poses.stand.img.decoding = "async";
  poses.stand.img.src = asset("thunder-stand.webp");
  function lazyPose(name, file) {
    var im = poses[name].img;
    if (im.src) return;
    im.src = asset(file);
    try { if (im.decode) im.decode().catch(function () { /* keep async */ }); } catch (e) { /* older */ }
  }
  poses.fly.img.onload = function () {
    if (poses.fly.img.naturalHeight) poses.fly.aspect = poses.fly.img.naturalWidth / poses.fly.img.naturalHeight;
  };
  poses.smash.img.onload = function () {
    if (poses.smash.img.naturalHeight) poses.smash.aspect = poses.smash.img.naturalWidth / poses.smash.img.naturalHeight;
  };
  poses.stand.img.onload = function () {
    if (poses.stand.img.naturalHeight) poses.stand.aspect = poses.stand.img.naturalWidth / poses.stand.img.naturalHeight;
  };

  /* ---------- DOM ---------- */
  var style = document.createElement("style");
  style.textContent = [
    ":root{--tg-fly:104px;--tg-stand:128px;--tg-smash:190px;--tg-clip:260px}",
    "@media (max-width:1024px){:root{--tg-fly:88px;--tg-stand:112px;--tg-smash:170px;--tg-clip:220px}}",
    "@media (max-width:480px){:root{--tg-fly:72px;--tg-stand:88px;--tg-smash:150px;--tg-clip:160px}}",
    "#tg-fx,#tg-hero,#tg-clip{position:fixed;left:0;top:0;pointer-events:none;z-index:70}",
    "#tg-fx{width:100%;height:100%;z-index:69}",
    "#tg-hero{transform-origin:center center;will-change:transform;filter:drop-shadow(0 8px 12px rgba(20,40,60,.18))}",
    "html[data-tg-theme='dark'] #tg-hero{filter:drop-shadow(0 12px 16px rgba(0,0,0,.5))}",
    "#tg-copy{position:fixed;z-index:72;pointer-events:none;max-width:15rem;padding:.45rem .7rem;border-radius:.8rem;",
    "font-size:.78rem;line-height:1.25;color:#f4fbff;background:rgba(10,20,32,.82);border:1px solid rgba(140,200,255,.35);",
    "opacity:0;transition:opacity .35s ease;transform:translate(-50%,-115%)}",
    "#tg-audio{position:fixed;z-index:74;left:max(0.75rem,env(safe-area-inset-left));bottom:max(0.75rem,env(safe-area-inset-bottom));",
    "width:2.75rem;height:2.75rem;display:grid;place-items:center;border-radius:999px;cursor:pointer;opacity:.72;",
    "color:var(--text,#0f1b26);background:color-mix(in srgb, var(--surface,#fff) 90%, transparent);border:1px solid var(--border,#dbe3ea);",
    "box-shadow:0 4px 14px color-mix(in srgb, var(--text,#0f1b26) 12%, transparent)}",
    "#tg-audio:hover,#tg-audio:focus-visible{opacity:1}",
    "#tg-audio svg{width:1.1rem;height:1.1rem}",
    "#tg-audio[aria-pressed='true']{color:#4a5968;opacity:.55}",
    ".tg-visually-hidden{position:fixed !important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    "@media (prefers-reduced-motion: reduce){html.tg-shake body{animation:none !important}}",
    "@keyframes tg-shake{0%{transform:translate(0,0)}20%{transform:translate(-5px,2px)}40%{transform:translate(5px,-2px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(2px,1px)}100%{transform:translate(0,0)}}",
    "html.tg-shake body{animation:tg-shake .45s ease-out}"
  ].join("");
  document.head.appendChild(style);

  var canvas = null;
  var fx = null;
  var hero = document.createElement("img");
  hero.id = "tg-hero";
  hero.alt = "";
  hero.setAttribute("aria-hidden", "true");
  hero.draggable = false;
  hero.style.opacity = "0";
  document.body.appendChild(hero);

  var clip = document.createElement("video");
  clip.id = "tg-clip";
  clip.muted = true;
  clip.defaultMuted = true;
  clip.playsInline = true;
  clip.preload = "none"; // P0: 2.2MB webm no longer preloads every page load; lazy on first smash
  clip.setAttribute("playsinline", "");
  clip.style.opacity = "0";
  document.body.appendChild(clip);
  var clipSrcSet = false;
  var clipWatch = { lastT: -1, lastWall: 0 };

  var copyEl = document.createElement("div");
  copyEl.id = "tg-copy";
  copyEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(copyEl);

  var liveEl = document.createElement("div");
  liveEl.className = "tg-visually-hidden";
  liveEl.setAttribute("aria-live", "polite");
  document.body.appendChild(liveEl);

  var btn = document.createElement("button");
  btn.id = "tg-audio";
  btn.type = "button";
  btn.setAttribute("data-tg-ignore", "");
  document.body.appendChild(btn);

  var muted = false;
  try { muted = localStorage.getItem("tg-muted") === "1"; } catch (e) { muted = false; }

  function boltIcon(off) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="currentColor" d="M13.2 1.5 5.2 13.2h5.2l-1.1 9.3 8.7-13.2h-5.5z"/>' +
      (off ? '<path d="M4 20 20 4" stroke="currentColor" stroke-width="2" fill="none"/>' : "") +
      "</svg>";
  }
  function paintBtn() {
    btn.setAttribute("aria-pressed", muted ? "true" : "false"); // pressed = muted convention
    btn.setAttribute("aria-label", muted ? "Storm sounds off. Turn them on." : "Storm sounds on. Turn them off.");
    btn.innerHTML = boltIcon(muted);
  }
  paintBtn();
  function announce(msg) { liveEl.textContent = ""; liveEl.textContent = msg; }

  /* ---------- audio: synth storm kit, compressor, voice gate, idle bus ---------- */
  var audioCtx = null;
  var master = null;
  var comp = null;
  var idleBus = null;
  var noiseBuf = null;
  var audioUnlocked = false;
  var voices = 0;
  var VOICE_PRI = { smash: 4, thunder: 3, whoosh: 2, idle: 1 };

  function unlockAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      audioCtx = new AC({ latencyHint: "interactive" });
      master = audioCtx.createGain();
      master.gain.value = muted ? 0 : 0.70; // P0: 0.85 -> 0.70
      comp = audioCtx.createDynamicsCompressor(); // P0: tames clipping
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.24;
      if (coarsePointer) {
        // small-speaker mode: roll off sub-bass, lift presence
        var low = audioCtx.createBiquadFilter();
        low.type = "lowshelf"; low.frequency.value = 100; low.gain.value = -6;
        var high = audioCtx.createBiquadFilter();
        high.type = "highshelf"; high.frequency.value = 2500; high.gain.value = 2.5;
        master.connect(low); low.connect(high); high.connect(comp);
      } else {
        master.connect(comp);
      }
      comp.connect(audioCtx.destination);
      idleBus = audioCtx.createGain();
      idleBus.gain.value = CONFIG.idleAudio.gain;
      idleBus.connect(master);
      var n = audioCtx.sampleRate * 2;
      noiseBuf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    audioUnlocked = true;
    return audioCtx;
  }

  function setMuted(next) {
    muted = next;
    try { localStorage.setItem("tg-muted", muted ? "1" : "0"); } catch (e) { /* private mode */ }
    paintBtn();
    if (master && audioCtx) {
      master.gain.setTargetAtTime(muted ? 0 : 0.70, audioCtx.currentTime, 0.02);
    }
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    unlockAudio();
    setMuted(!muted);
  });

  // voice gate: cap simultaneous synth voices; idle audio is shed first
  function voiceEnter(kind) {
    if (!audioCtx || muted) return false;
    if (voices >= 8 && (VOICE_PRI[kind] || 2) <= VOICE_PRI.idle) return false;
    if (voices >= 14) return false;
    voices++;
    return true;
  }
  function voiceExit() { voices = Math.max(0, voices - 1); }
  function hookEnd(node) {
    try {
      var prev = node.onended;
      node.onended = function (ev) { voiceExit(); if (prev) prev.call(node, ev); };
    } catch (e) { voiceExit(); }
  }

  function noiseBurst(when, dur, opt, kind, bus) {
    if (!voiceEnter(kind || "whoosh")) return;
    var src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var filter = audioCtx.createBiquadFilter();
    filter.type = opt.type;
    filter.frequency.setValueAtTime(Math.max(40, opt.freq), when);
    filter.Q.value = opt.q;
    if (opt.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opt.sweepTo), when + dur);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(opt.peak, when + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus || master);
    hookEnd(src);
    src.start(when);
    src.stop(when + dur + 0.03);
  }

  function tone(when, freq, dur, peak, type, slide, kind, bus) {
    if (!voiceEnter(kind || "whoosh")) return;
    // missing-fundamental helper for small speakers: reinforce <100Hz with a 2f triangle
    if (coarsePointer && freq < 100) {
      var o2 = audioCtx.createOscillator();
      o2.type = "triangle";
      o2.frequency.setValueAtTime(freq * 2, when);
      var g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.0001, when);
      g2.gain.exponentialRampToValueAtTime(0.06, when + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o2.connect(g2); g2.connect(bus || master);
      o2.start(when); o2.stop(when + dur + 0.02);
    }
    var o = audioCtx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(Math.max(30, freq), when);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), when + dur);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(bus || master);
    hookEnd(o);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function playWhoosh(when, peak) {
    noiseBurst(when, 0.5, { type: "bandpass", freq: 1500, q: 0.85, peak: peak, sweepTo: 180 }, "whoosh");
    noiseBurst(when, 0.36, { type: "highpass", freq: 700, q: 0.4, peak: peak * 0.45, sweepTo: 160 }, "whoosh");
  }
  function playCrack(when) {
    noiseBurst(when, 0.16, { type: "highpass", freq: 2200, q: 0.55, peak: 0.34 }, "thunder");
    tone(when, 1680, 0.07, 0.07, "square", 320, "thunder");
  }
  function playRumble(when) {
    tone(when, 52, 0.7, 0.26, "sine", 36, "thunder");
    noiseBurst(when, 0.75, { type: "lowpass", freq: 260, q: 0.7, peak: 0.18, sweepTo: 70 }, "thunder");
  }
  function playBoom(when) {
    tone(when, 82, 0.42, 0.5, "sine", 32, "smash");
    tone(when, 46, 0.55, 0.36, "sine", 26, "smash");
    noiseBurst(when, 0.2, { type: "lowpass", freq: 160, q: 0.5, peak: 0.32, sweepTo: 50 }, "smash");
  }
  function playBlast(when) {
    noiseBurst(when, 0.2, { type: "highpass", freq: 1600, q: 0.45, peak: 0.46 }, "smash");
    tone(when, 740, 0.1, 0.1, "square", 160, "smash");
    noiseBurst(when, 0.32, { type: "bandpass", freq: 520, q: 0.7, peak: 0.26, sweepTo: 120 }, "smash");
  }
  function playThunder(when) {
    tone(when, 54, 1.2, 0.4, "sine", 28, "thunder");
    tone(when + 0.1, 40, 1.35, 0.3, "sine", 22, "thunder");
    noiseBurst(when, 1.3, { type: "lowpass", freq: 280, q: 0.45, peak: 0.3, sweepTo: 48 }, "thunder");
  }
  // P0: rebalanced -30% (was summing ~+5.6dB over 0dBFS and clipping every hit); 6 -> 4 partials
  function playHit(when) {
    var partials = [118, 176, 263, 397];
    var peaks = [0.11, 0.095, 0.08, 0.065];
    for (var i = 0; i < partials.length; i++) {
      var f = partials[i] * (1 + Math.random() * 0.012);
      tone(when, f, Math.max(0.16, 0.48 - i * 0.06), peaks[i], "triangle", f * 0.7, "smash");
    }
    tone(when, 60, 0.34, 0.30, "sine", 36, "smash");
    noiseBurst(when, 0.1, { type: "highpass", freq: 980, q: 0.45, peak: 0.29 }, "smash");
    noiseBurst(when + 0.02, 1.15, { type: "lowpass", freq: 400, q: 0.55, peak: 0.21, sweepTo: 70 }, "smash");
    tone(when + 0.03, 46, 1.05, 0.22, "sine", 30, "smash");
  }
  /* new original recipes (review §5) */
  function playTwirl(when) { // hammer-twirl whoosh: bandpass LFO 380<->1150Hz @3.2Hz
    if (!voiceEnter("whoosh")) return;
    var src = audioCtx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 760; bp.Q.value = 2;
    var lfo = audioCtx.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = 3.2;
    var lfoG = audioCtx.createGain(); lfoG.gain.value = 385;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.12, when + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    src.connect(bp); bp.connect(g); g.connect(master);
    hookEnd(src);
    src.start(when); lfo.start(when);
    src.stop(when + 0.5); lfo.stop(when + 0.5);
  }
  function playCapeSnap(when) { // 3 snaps
    for (var i = 0; i < 3; i++) {
      noiseBurst(when + i * 0.09, 0.07, { type: "bandpass", freq: 520, q: 1.4, peak: 0.10, sweepTo: 260 }, "whoosh");
    }
  }
  function playThud(when) { tone(when, 74, 0.24, 0.34, "sine", 30, "smash"); }
  function playExhale(when) { // abstract effort breath — no vocal grunts (IP risk)
    noiseBurst(when, 0.28, { type: "bandpass", freq: 640, q: 1.1, peak: 0.055, sweepTo: 380 }, "whoosh");
  }
  /* idle bus: distant weather, stays <= -30dBFS (review §5) */
  function playIdleRumble(when) {
    tone(when, 48, 1.6, 0.045, "sine", 30, "idle", idleBus);
  }
  function playIdleCrackle(when) {
    noiseBurst(when, 0.045, { type: "bandpass", freq: 4200, q: 9, peak: 0.012 }, "idle", idleBus);
  }

  /* ---------- sizing: CSS-var tiers + vw/vh hard caps (review §1) ---------- */
  var sizes = { fly: 104, stand: 128, smash: 190, clip: 260 };
  function readSizes() {
    var cs = null;
    try { cs = getComputedStyle(document.documentElement); } catch (e) { cs = null; }
    ["fly", "stand", "smash", "clip"].forEach(function (k) {
      var v = NaN;
      if (cs) v = parseFloat(cs.getPropertyValue(CONFIG.sizeVar[k]));
      if (!isFinite(v) || v <= 0) v = CONFIG.sizeFallback[k];
      var cap = CONFIG.sizeCap[k];
      var w = v;
      if (cap[0] > 0) w = Math.min(w, window.innerWidth * cap[0]);
      if (cap[1] > 0) w = Math.min(w, window.innerHeight * cap[1]);
      sizes[k] = Math.max(40, w);
    });
  }
  readSizes();

  /* ---------- explicit state machine ---------- */
  var ST = { STAND: "STAND", FOLLOW: "FOLLOW", FLY_LAP: "FLY_LAP", IDLE_JAZZ: "IDLE_JAZZ", SMASH_WINDUP: "SMASH_WINDUP", SMASH_IMPACT: "SMASH_IMPACT", SMASH_RECOVER: "SMASH_RECOVER" };
  var state = ST.STAND;
  function setState(s) { state = s; }
  function isSmashState() { return state === ST.SMASH_WINDUP || state === ST.SMASH_IMPACT || state === ST.SMASH_RECOVER; }

  var seenPointer = false;
  var lastActive = performance.now();
  var lastScrollT = 0;
  var face = 1;
  var poseName = "";

  /* follow physics state */
  var fol = { cx: -200, cy: 40, vx: 0, vy: 0, tx: 0, ty: 0, face: 1, faceT: 0, bank: 0, stillT: 0 };

  /* pure: follow one step (testable) */
  function followStep(s, dt, now) {
    var F = CONFIG.follow;
    var n = dt / 16.667;
    var dx = s.tx - s.cx, dy = s.ty - s.cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    var gx, gy;
    if (d > F.deadR) {
      gx = s.tx + s.face * F.offX;
      gy = s.ty + F.offY;
    } else { gx = s.cx; gy = s.cy; }
    if (now - s.stillT > F.stillMs) { // Lissajous drift when cursor is still
      var ph = (now - s.stillT) / 1000 * F.driftHz * Math.PI * 2;
      gx += Math.cos(ph) * F.driftAmp;
      gy += Math.sin(ph * 1.3) * F.driftAmp * 0.6;
    }
    s.vx += (gx - s.cx) * F.pull * n;
    s.vy += (gy - s.cy) * F.pull * n;
    var drag = Math.pow(F.drag, n);
    s.vx *= drag; s.vy *= drag;
    var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    var vmax = F.vmax * n;
    if (sp > vmax) { s.vx *= vmax / sp; s.vy *= vmax / sp; }
    s.cx += s.vx * n; s.cy += s.vy * n;
    if (s.vx > F.flipThresh && now - s.faceT > F.flipDebounce) { s.face = 1; s.faceT = now; }
    else if (s.vx < -F.flipThresh && now - s.faceT > F.flipDebounce) { s.face = -1; s.faceT = now; }
    var tb = clamp(s.vy * F.bankK, -F.bankMax, F.bankMax);
    s.bank += (tb - s.bank) * (1 - Math.exp(-dt / 90));
    return s;
  }

  /* pure-ish: stand anchor (review P1 #15 — mobile top-right perch) */
  function anchorCalc() {
    var w = sizes.stand;
    var h = w / poses.stand.aspect;
    if (window.innerWidth < 640) {
      var safeR = 20, safeT = 76; // includes safe-area headroom on notched phones
      return { x: window.innerWidth - safeR - w * 0.5, y: safeT + h * 0.5, face: 1 };
    }
    var el = document.querySelector(".hero h1") || document.querySelector(".hero") || document.querySelector("header");
    var r = el ? el.getBoundingClientRect() : { left: 16, top: 96, right: 280, bottom: 220, width: 264, height: 124 };
    var x = r.right + 28;
    var y = r.top + r.height * 0.62;
    if (x > window.innerWidth - 64) {
      x = Math.max(64, window.innerWidth - 72);
      y = Math.min(window.innerHeight - 90, r.bottom + 8);
    }
    y = clamp(y, 64, window.innerHeight - 80); // universal vertical clamp
    return { x: x, y: y, face: 1 };
  }

  /* pure: map elapsed seconds onto a smash timeline */
  function smashPhase(t, tl) {
    var acc = 0;
    for (var i = 0; i < tl.phases.length; i++) {
      var d = tl.phases[i][1];
      if (t < acc + d) return { phase: tl.phases[i][0], local: d > 0 ? (t - acc) / d : 1, index: i };
      acc += d;
    }
    return { phase: "done", local: 1, index: tl.phases.length };
  }
  function smashTimeline(kind) {
    var m = coarsePointer ? 0.65 : 1; // mobile timelines run ~0.9s
    if (kind === "link") {
      return { kind: kind, navigate: true, phases: [["swoop", 0.55 * m], ["aim", 0.20 * m], ["windup", 0.30 * m], ["impact", 0.09], ["settle", 0.25 * m]] };
    }
    return { kind: kind, navigate: false, phases: [["swoop", 0.28 * m], ["windup", 0.32 * m], ["impact", 0.09], ["recover", 0.65 * m]] };
  }

  function shouldSmashMode() {
    var forced = document.documentElement.dataset.thunderMode;
    if (forced === "smash") return true;
    if (forced === "follow") return false;
    return coarsePointer && window.matchMedia("(hover: none)").matches;
  }

  /* ---------- FX: particles / bolts / shocks (burst gated under reduced-motion, P0) ---------- */
  var particles = [];
  var bolts = [];
  var shocks = [];
  var flash = 0;
  var fxWasActive = false;

  function makeBolt(x1, y1, x2, y2, jag) {
    var pts = [{ x: x1, y: y1 }];
    (function seg(a, b, depth, j) {
      if (depth === 0) { pts.push(b); return; }
      var m = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * j, y: (a.y + b.y) / 2 + (Math.random() - 0.5) * j };
      seg(a, m, depth - 1, j * 0.55);
      seg(m, b, depth - 1, j * 0.55);
    })({ x: x1, y: y1 }, { x: x2, y: y2 }, 5, jag || 70);
    return { pts: pts, life: 0.85, max: 0.85 };
  }

  function isDark() {
    var t = document.documentElement.dataset.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function syncTheme() { document.documentElement.dataset.tgTheme = isDark() ? "dark" : "light"; }

  // P0: reduced-motion users get no burst at all (was: 56 particles + 3 bolts + flash)
  function burst(x, y, tier) {
    if (reduceMotion) return;
    ensureCanvas();
    var n = tier === "sparkle" ? 10 : tier === "dim" ? 28 : 56;
    var colors = isDark()
      ? ["#f4fbff", "#8ecfff", "#e8b15a", "#ffffff"]
      : ["#0e7490", "#b8860b", "#1e3a5f", "#0f766e"];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 0.7 + Math.random() * 3.4;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.2, life: 0.9 + Math.random() * 0.8, max: 1.7, r: 1.2 + Math.random() * 2.4, color: colors[i % colors.length] });
    }
    if (tier !== "sparkle") {
      shocks.push({ x: x, y: y, life: 1.15, max: 1.15 });
      if (tier === "full") {
        shocks.push({ x: x, y: y, life: 0.85, max: 0.85 });
        bolts.push(makeBolt(x + (Math.random() * 120 - 60), -20, x, y, 90));
        bolts.push(makeBolt(x - 40, -10, x + 16, y - 8, 60));
      } else {
        bolts.push(makeBolt(x + (Math.random() * 80 - 40), -20, x, y, 60));
      }
      flash = isDark() ? 0.22 : 0.1;
    }
    wake();
  }

  function shakeScreen() {
    if (reduceMotion) return;
    document.documentElement.classList.remove("tg-shake");
    void document.documentElement.offsetWidth;
    document.documentElement.classList.add("tg-shake");
    window.setTimeout(function () { document.documentElement.classList.remove("tg-shake"); }, CONFIG.smash.shakeMs + 60);
  }

  // single impact helper — kills the 3 duplicated hit blocks (review §2)
  function onImpact(x, y, tier, opts) {
    opts = opts || {};
    burst(x, y, tier);
    if (tier === "full" && audioUnlocked && !muted && audioCtx) {
      var t = audioCtx.currentTime + 0.01;
      playBoom(t);
      playBlast(t + 0.18);
      playThunder(t + 0.38);
    }
    if (tier === "full" && opts.shake && !reduceMotion) shakeScreen();
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "tg-fx";
    fx = canvas.getContext("2d");
    document.body.insertBefore(canvas, hero);
    resizeFx();
  }
  function resizeFx() {
    if (!canvas || !fx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.0 : 1.5); // P1: DPR caps
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawFx(dt) {
    if (!fx) return;
    var active = particles.length || bolts.length || shocks.length || flash > 0;
    if (!active) { // P0: skip empty draws (one final clear)
      if (fxWasActive) { fx.clearRect(0, 0, window.innerWidth, window.innerHeight); fxWasActive = false; }
      return;
    }
    fxWasActive = true;
    fx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (flash > 0) {
      var cap = isDark() ? 0.28 : 0.12;
      var tint = isDark() ? "186,214,255" : "255,255,255";
      fx.fillStyle = "rgba(" + tint + "," + Math.min(cap, flash * (isDark() ? 1.6 : 0.8)) + ")";
      fx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      flash = Math.max(0, flash - dt / (isDark() ? 900 : 500));
    }
    var i, p;
    for (i = bolts.length - 1; i >= 0; i--) {
      var b = bolts[i];
      b.life -= dt / 1000;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      var alpha = b.life / b.max;
      var dark = isDark();
      fx.beginPath();
      fx.moveTo(b.pts[0].x, b.pts[0].y);
      for (p = 1; p < b.pts.length; p++) fx.lineTo(b.pts[p].x, b.pts[p].y);
      fx.strokeStyle = dark ? "rgba(210,232,255," + alpha + ")" : "rgba(14,90,140," + alpha + ")";
      fx.lineWidth = dark ? 3.2 : 2.4;
      fx.shadowColor = dark ? "rgba(120,200,255,.85)" : "rgba(14,116,144,.45)";
      fx.shadowBlur = dark ? 16 : 8;
      fx.stroke();
      fx.lineWidth = 1.1;
      fx.shadowBlur = 0;
      fx.strokeStyle = dark ? "rgba(255,255,255," + alpha + ")" : "rgba(186,230,253," + (alpha * 0.7) + ")";
      fx.stroke();
    }
    fx.shadowBlur = 0;
    for (i = shocks.length - 1; i >= 0; i--) {
      var ring = shocks[i];
      ring.life -= dt / 1000;
      if (ring.life <= 0) { shocks.splice(i, 1); continue; }
      var u = 1 - ring.life / ring.max;
      fx.beginPath();
      fx.arc(ring.x, ring.y, 16 + u * 150, 0, Math.PI * 2);
      var ringColor = isDark() ? "180,220,255" : "14,116,144";
      fx.strokeStyle = "rgba(" + ringColor + "," + (ring.life / ring.max) * (isDark() ? 0.8 : 0.55) + ")";
      fx.lineWidth = 3 * (1 - u);
      fx.stroke();
    }
    for (i = particles.length - 1; i >= 0; i--) {
      var pt = particles[i];
      pt.life -= dt / 1000;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.vy += 0.22 * (dt / 16);
      pt.x += pt.vx * (dt / 16);
      pt.y += pt.vy * (dt / 16);
      fx.globalAlpha = Math.max(0, pt.life / pt.max);
      fx.fillStyle = pt.color;
      fx.beginPath();
      fx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      fx.fill();
    }
    fx.globalAlpha = 1;
  }

  function place(name, x, y, w, rot, alpha, scale) {
    var pose = poses[name];
    var h = w / pose.aspect;
    var dw = w * scale;
    var dh = h * scale;
    if (poseName !== name) {
      poseName = name;
      if (hero.src !== pose.img.src) hero.src = pose.img.src;
    }
    hero.style.width = dw + "px";
    hero.style.height = dh + "px";
    hero.style.opacity = String(alpha);
    hero.style.transform = "translate3d(" + (x - dw / 2) + "px," + (y - dh / 2) + "px,0) rotate(" + rot + "deg) scaleX(" + face + ")";
  }
  function hideHero() { hero.style.opacity = "0"; }

  /* ---------- idle jazz: 6-antic weighted pool, tiered @2s/@8s/@20s (review §3) ---------- */
  var ANTICS = [
    { id: "axetap", tiers: [1], dur: 800, silent: true },
    { id: "twirl", tiers: [2], dur: 1200, w: 30, cd: 45000, audio: "twirl" },
    { id: "fist", tiers: [2], dur: 1000, w: 22, cd: 60000, audio: "fist" },
    { id: "survey", tiers: [2], dur: 2000, w: 20, cd: 50000 },
    { id: "cape", tiers: [2], dur: 1400, w: 16, cd: 55000, audio: "cape" },
    { id: "charge", tiers: [3], dur: 1800, w: 7, cd: 90000, audio: "charge" },
    { id: "worthy", tiers: [2, 3], dur: 1600, w: 5, cd: 75000, audio: "thud" }
  ];
  var COPY_LINES = [
    "Hold fast, traveler — the storm bears us onward.",
    "A quiet sky is a good sky. I stand ready regardless.",
    "The storm marks your place."
  ];
  var jazz = { tierFired: [false, false, false], lastAntic: null, lastPlayed: {}, cur: null, returnTo: ST.STAND, lastCopy: 0 };
  var ambientEvents = []; // passive budget: laps + jazz + flourishes
  function budgetOk() {
    var cut = performance.now() - 60000;
    ambientEvents = ambientEvents.filter(function (t) { return t > cut; });
    return ambientEvents.length < CONFIG.jazz.budgetPerMin;
  }
  function budgetSpend() { ambientEvents.push(performance.now()); }

  function pickAntic(tier, now) {
    if (tier === 1) return ANTICS[0]; // micro, always available, silent
    var cands = ANTICS.filter(function (a) {
      return a.tiers.indexOf(tier) >= 0 && a.id !== jazz.lastAntic && (now - (jazz.lastPlayed[a.id] || 0)) > a.cd;
    });
    if (!cands.length) return null;
    var total = 0, i;
    for (i = 0; i < cands.length; i++) total += cands[i].w;
    var r = Math.random() * total;
    for (i = 0; i < cands.length; i++) { r -= cands[i].w; if (r <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }

  var copyTimer = 0;
  function maybeCopy(x, y, now, tier) {
    if (tier < 2 || now - jazz.lastCopy < CONFIG.jazz.copyCdMs || Math.random() > 0.35) return;
    jazz.lastCopy = now;
    copyEl.textContent = COPY_LINES[Math.floor(Math.random() * COPY_LINES.length)];
    copyEl.style.left = x + "px";
    copyEl.style.top = (y - sizes.stand * 0.6) + "px";
    copyEl.style.opacity = "1";
    if (copyTimer) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(function () { copyEl.style.opacity = "0"; }, 4000);
  }

  function jazzBasePos() {
    if (jazz.returnTo === ST.FOLLOW) return { x: fol.cx, y: fol.cy, face: fol.face };
    var a = anchorCalc();
    return { x: a.x, y: a.y, face: a.face };
  }

  function startJazz(tier, now) {
    if (reduceMotion || !budgetOk()) { jazz.tierFired[tier - 1] = true; return; }
    var def = pickAntic(tier, now);
    if (!def) { jazz.tierFired[tier - 1] = true; return; }
    jazz.tierFired[tier - 1] = true;
    jazz.lastAntic = def.id;
    jazz.lastPlayed[def.id] = now;
    jazz.returnTo = state;
    jazz.cur = { def: def, t0: now, struck: false, snapped: 0, tier: tier };
    setState(ST.IDLE_JAZZ);
    budgetSpend();
    var base = jazzBasePos();
    if (def.audio === "twirl" && audioUnlocked && !muted && audioCtx) playTwirl(audioCtx.currentTime + 0.01);
    if (def.audio === "cape" && audioUnlocked && !muted && audioCtx) playCapeSnap(audioCtx.currentTime + 0.01);
    if (def.audio === "thud" && audioUnlocked && !muted && audioCtx) playThud(audioCtx.currentTime + 0.35);
    if (def.audio === "charge" && audioUnlocked && !muted && audioCtx) playRumble(audioCtx.currentTime + 0.01);
    if (def.audio === "fist" && audioUnlocked && !muted && audioCtx) playCrack(audioCtx.currentTime + 0.35);
    maybeCopy(base.x, base.y, now, tier);
    wake();
  }

  function endJazz() {
    jazz.cur = null;
    hideCopySoon();
    setState(jazz.returnTo === ST.FOLLOW ? ST.FOLLOW : ST.STAND);
  }
  function hideCopySoon() {
    if (copyTimer) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(function () { copyEl.style.opacity = "0"; }, 1200);
  }

  function checkJazz(now) {
    if (state !== ST.STAND && state !== ST.FOLLOW) return;
    if (document.hidden) return;
    var idle = now - lastActive;
    var tiers = [CONFIG.jazz.t1, CONFIG.jazz.t2, CONFIG.jazz.t3];
    for (var i = 0; i < 3; i++) {
      if (!jazz.tierFired[i] && idle >= tiers[i]) { startJazz(i + 1, now); return; }
    }
  }

  function stepJazz(now) {
    var j = jazz.cur;
    if (!j) { endJazz(); return; }
    var u = (now - j.t0) / j.def.dur;
    if (u >= 1) { endJazz(); return; }
    var base = jazzBasePos();
    face = base.face;
    var w = sizes.stand;
    var env = Math.sin(Math.min(1, u) * Math.PI);
    switch (j.def.id) {
      case "axetap":
        place("stand", base.x, base.y, w, Math.sin(u * Math.PI * 2) * 6 * env, 1, 1 + 0.02 * env);
        break;
      case "twirl":
        lazyPose("smash", "thunder-smash.webp");
        place("stand", base.x, base.y, w, Math.sin(u * Math.PI * 4) * 9 * env, 1, 1 + 0.04 * env);
        break;
      case "fist": {
        place("stand", base.x, base.y, w, Math.sin(u * Math.PI) * 4, 1, 1 + 0.03 * env);
        if (u > 0.4 && !j.struck) {
          j.struck = true;
          var hx = base.x + base.face * 30, hy = base.y - 40;
          bolts.push(makeBolt(hx, hy - 160, hx, hy, 46));
          if (Math.random() > 0.5) bolts.push(makeBolt(hx + 24, hy - 200, hx + 8, hy - 10, 40));
          wake();
        }
        break;
      }
      case "survey":
        face = u < 0.5 ? base.face : -base.face;
        place("stand", base.x, base.y, w, -12 + 24 * u, 1, 1);
        break;
      case "cape":
        place("stand", base.x, base.y, w, Math.sin(u * Math.PI * 2) * 3, 1, 1 + 0.06 * env);
        break;
      case "charge": {
        lazyPose("fly", "thunder-fly.webp");
        var ry = base.y - 40 * Math.sin(u * Math.PI);
        place("fly", base.x, ry, sizes.fly, 0, 1, 1);
        if (u > 0.3 && j.snapped < 1) { j.snapped = 1; bolts.push(makeBolt(base.x - 60, -20, base.x - 20, ry - 30, 70)); wake(); }
        if (u > 0.6 && j.snapped < 2) { j.snapped = 2; bolts.push(makeBolt(base.x + 70, -20, base.x + 25, ry - 24, 70)); flash = Math.max(flash, 0.08); wake(); }
        break;
      }
      case "worthy": {
        place("stand", base.x, base.y, w, 0, 1, 1 + 0.05 * env);
        if (u > 0.5 && !j.struck) {
          j.struck = true;
          shocks.push({ x: base.x, y: base.y + w * 0.42, life: 0.9, max: 0.9 });
          wake();
        }
        break;
      }
    }
  }

  /* ---------- laps & flourishes ---------- */
  var lap = { next: 0, t0: 0, dur: 0, cx: 0, cy: 0, rx: 0, ry: 0, flourish: false };
  function checkLap(now) {
    if (state !== ST.STAND && state !== ST.FOLLOW) return;
    if (document.hidden || !budgetOk()) { lap.next = now + 15000; return; }
    if (!lap.next) lap.next = now + (state === ST.STAND ? rand(25000, 40000) : rand(45000, 75000));
    if (now < lap.next) return;
    if (now - lastScrollT < 4000) { lap.next = now + 8000; return; } // suppressed while user scrolled
    lap.t0 = now;
    lap.flourish = state === ST.FOLLOW;
    lap.dur = lap.flourish ? 1800 : 3200;
    var c = lap.flourish ? { x: fol.cx, y: fol.cy } : anchorCalc();
    lap.cx = c.x; lap.cy = c.y;
    lap.rx = Math.min(180, window.innerWidth * 0.22);
    lap.ry = Math.min(72, window.innerHeight * 0.1);
    setState(ST.FLY_LAP);
    budgetSpend();
    lazyPose("fly", "thunder-fly.webp");
    if (audioUnlocked && !muted && audioCtx) playWhoosh(audioCtx.currentTime, 0.045);
    wake();
  }
  function stepLap(now) {
    var t = (now - lap.t0) / lap.dur;
    if (t >= 1) {
      lap.next = now + (lap.flourish ? rand(45000, 75000) : rand(25000, 40000));
      setState(seenPointer && !shouldSmashMode() ? ST.FOLLOW : ST.STAND);
      return;
    }
    var ang = t * Math.PI * 2;
    face = Math.cos(ang) > 0 ? -1 : 1;
    var fade = t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1;
    place("fly", lap.cx + Math.cos(ang) * lap.rx, lap.cy - 30 + Math.sin(ang) * lap.ry, sizes.fly, 0, fade, 1);
  }

  /* ---------- smash engine ---------- */
  var HAMMER_X = 0.26;
  var HAMMER_Y = 0.49;
  var smash = {
    t0: 0, x: 0, y: 0, face: 1, fromX: 0, fromY: 0, ctrlX: 0, ctrlY: 0,
    hit: false, go: "", blank: false, link: false, tl: null, useClip: false, fxTier: "full", mark: null, cooldownUntil: 0, throttleUntil: 0
  };
  var tapTimes = [];
  var lastSmashAt = 0;

  function placeHammer(tx, ty, w, scale, rot, alpha) {
    var dw = w * scale;
    var dh = dw / poses.smash.aspect;
    var cx = tx - smash.face * HAMMER_X * dw;
    var cy = ty - HAMMER_Y * dh;
    place("smash", cx, cy, w, rot, alpha, scale);
  }

  function clearMark() {
    if (!smash.mark) return;
    smash.mark.el.style.outline = smash.mark.outline;
    smash.mark.el.style.outlineOffset = smash.mark.offset;
    smash.mark = null;
  }

  // P0: re-entrancy guard — stray clicks mid-smash can no longer wipe a pending navigation
  function startSmash(x, y, opts) {
    opts = opts || {};
    var nowMs = performance.now();
    if (isSmashState()) return false;
    if (nowMs < smash.throttleUntil) { // sparkle-only throttle
      burst(x, y, "sparkle");
      return false;
    }
    // spam economy: >3 taps/2s -> sparkle-only + 3s throttle
    tapTimes.push(nowMs);
    tapTimes = tapTimes.filter(function (t) { return nowMs - t < CONFIG.smash.spamWindowMs; });
    var tier = "full";
    if (tapTimes.length > CONFIG.smash.spamCount) {
      tier = "sparkle";
      smash.throttleUntil = nowMs + CONFIG.smash.throttleMs;
      burst(x, y, "sparkle");
      return false;
    } else if (nowMs < smash.cooldownUntil) {
      tier = "dim"; // diminished FX: 28 particles, no shake, no audio
    }
    lazyPose("smash", "thunder-smash.webp");
    lazyPose("fly", "thunder-fly.webp");
    ensureCanvas();
    unlockAudio(); // lazy AudioContext: created at smash, not on every pointerdown
    // lazy-load the webm on first smash (preload="none" until now)
    if (!clipSrcSet) {
      clipSrcSet = true;
      try { clip.src = asset("thunder-strike.webm"); clip.load(); } catch (e) { /* sprite path */ }
    }
    smash.t0 = nowMs;
    smash.x = x; smash.y = y;
    smash.hit = false;
    smash.go = opts.go || "";
    smash.blank = !!opts.blank;
    smash.link = !!opts.link;
    smash.tl = smashTimeline(opts.link ? "link" : "tap");
    smash.impactIdx = 0;
    for (var pi = 0; pi < smash.tl.phases.length; pi++) {
      if (smash.tl.phases[pi][0] === "impact") { smash.impactIdx = pi; break; }
    }
    smash.fxTier = tier;
    smash.face = x < window.innerWidth * 0.5 ? -1 : 1;
    face = smash.face;
    smash.fromX = fol.cx > -100 && seenPointer ? fol.cx : (smash.face === 1 ? -190 : window.innerWidth + 190);
    smash.fromY = fol.cx > -100 && seenPointer ? fol.cy : clamp(y - 280, 20, window.innerHeight * 0.45);
    smash.ctrlX = (smash.fromX + x) / 2;
    smash.ctrlY = Math.min(smash.fromY, y) - 170;
    // clip is a render-strategy flag, not a state (review §2)
    smash.useClip = !reduceMotion && clip.readyState >= 2 && !!clipSrcSet;
    clipWatch.lastT = -1;
    clipWatch.lastWall = nowMs;
    if (smash.useClip) {
      hideHero();
      placeClip();
      clip.playbackRate = 1.15;
      try { clip.currentTime = 0; } catch (e) { /* seek when ready */ }
      clip.style.opacity = "1";
      var playing = clip.play();
      if (playing && playing.catch) {
        playing.catch(function () { smash.useClip = false; clip.style.opacity = "0"; });
      }
    }
    if (audioUnlocked && !muted && audioCtx && !smash.useClip && tier === "full") {
      playWhoosh(audioCtx.currentTime + 0.01, 0.16);
    }
    smash.gapSinceLast = nowMs - lastSmashAt;
    lastSmashAt = nowMs;
    setState(ST.SMASH_WINDUP);
    wake();
    return true;
  }

  function placeClip() {
    var aspect = clip.videoWidth && clip.videoHeight ? clip.videoWidth / clip.videoHeight : 400 / 608;
    var w = sizes.clip;
    var h = w / aspect;
    clip.style.width = w + "px";
    clip.style.height = h + "px";
    clip.style.transform = "translate3d(" + (smash.x - 0.4 * w) + "px," + (smash.y - 0.96 * h) + "px,0)";
  }

  function endSmash() {
    var url = smash.go;
    var blank = smash.blank;
    smash.go = "";
    smash.blank = false;
    smash.useClip = false;
    try { clip.pause(); } catch (e) { /* noop */ }
    clip.style.opacity = "0";
    hideHero();
    clearMark();
    smash.cooldownUntil = performance.now() + CONFIG.smash.cooldownMs;
    setState(seenPointer && !shouldSmashMode() ? ST.FOLLOW : ST.STAND);
    if (!url) return;
    if (blank) { try { window.open(url, "_blank", "noopener"); } catch (e) { /* blocked */ } }
    else { try { window.location.assign(url); } catch (e) { /* noop */ } }
  }

  function stepSmash(now) {
    // clip render path with stall watchdog (P0: stall used to freeze mascot + kill navigation)
    if (smash.useClip) {
      placeClip();
      var ct = -1;
      try { ct = clip.currentTime; } catch (e) { ct = -1; }
      if (ct > clipWatch.lastT + 0.001) { clipWatch.lastT = ct; clipWatch.lastWall = now; }
      else if (now - clipWatch.lastWall > 1500) { endSmash(); return; } // stalled -> force end
      var dur = 0;
      try { dur = clip.duration || 0; } catch (e) { dur = 0; }
      if (!smash.hit && dur > 0 && ct > dur * 0.9) {
        smash.hit = true;
        setState(ST.SMASH_IMPACT);
        var idleLong = smash.gapSinceLast > 15000 || smash.link;
        onImpact(smash.x, smash.y, smash.fxTier, { shake: idleLong });
        setState(ST.SMASH_RECOVER);
      }
      var ended = false;
      try { ended = clip.ended; } catch (e) { ended = false; }
      if (ended) endSmash();
      return;
    }
    var t = (now - smash.t0) / 1000;
    var ph = smashPhase(t, smash.tl);
    var sw = sizes.smash;
    var fw = sizes.fly;
    face = smash.face;
    if (ph.phase === "done") { endSmash(); return; }
    // robust impact: fires when crossing into/past the impact phase even if a
    // long frame skipped the 90ms window (matters on janky/older devices)
    if (!smash.hit && ph.index >= smash.impactIdx) {
      smash.hit = true;
      setState(ST.SMASH_IMPACT);
      onImpact(smash.x, smash.y, smash.fxTier, { shake: smash.gapSinceLast > 15000 || smash.link });
    }
    if (ph.phase === "swoop" || ph.phase === "aim") {
      setState(ST.SMASH_WINDUP);
      var u = ph.phase === "swoop" ? easeOut(ph.local) : 1;
      var lookX = smash.x - smash.face * 86;
      var lookY = smash.y - 78;
      var px = quad(smash.fromX, smash.ctrlX, lookX, u);
      var py = quad(smash.fromY, smash.ctrlY, lookY, u);
      var hover = ph.phase === "aim" ? Math.sin(ph.local * Math.PI) * 3 : 0;
      place("fly", px, py + hover, fw, smash.face * 8, 1, lerp(0.72, 1, u));
      return;
    }
    if (ph.phase === "windup") {
      setState(ST.SMASH_WINDUP);
      var d = easeIn(ph.local);
      placeHammer(smash.x, smash.y - 86 * (1 - d), sw, lerp(0.96, 1.04, d), smash.face * 2 * (1 - d), 1);
      return;
    }
    if (ph.phase === "impact") {
      setState(ST.SMASH_IMPACT); // hit already fired above (or fires here on first sample)
      var press = ph.local < 0.3 ? Math.sin((ph.local / 0.3) * Math.PI) * 5 : 0;
      placeHammer(smash.x, smash.y + press, sw, 1.04, 0, 1);
      return;
    }
    // settle / recover
    setState(ST.SMASH_RECOVER);
    var h = ph.local;
    placeHammer(smash.x, smash.y, sw, lerp(1.04, 1, Math.min(1, h * 2)), 0, 1);
  }

  /* ---------- stand ---------- */
  function stepStand(now) {
    var a = anchorCalc();
    face = a.face;
    var breathe = reduceMotion ? 0 : Math.sin(now / 980) * 1.8;
    var glance = reduceMotion ? 0 : Math.sin(now / 1600) * 2.4;
    place("stand", a.x, a.y + breathe, sizes.stand, a.face * 6 + glance, 1, 1);
  }

  /* ---------- main loop with sleep (P0: no more always-on rAF) ---------- */
  var raf = 0;
  var last = performance.now();
  var idleTimer = 0;
  var nextRumbleT = 0;
  var nextCrackleT = 0;

  function armIdleAudio(now) {
    if (!audioUnlocked || muted || !audioCtx) return;
    if (!nextRumbleT) nextRumbleT = now + rand(CONFIG.idleAudio.rumbleMin, CONFIG.idleAudio.rumbleMax);
    if (!nextCrackleT) nextCrackleT = now + rand(CONFIG.idleAudio.tickMin, CONFIG.idleAudio.tickMax);
  }
  function pumpIdleAudio(now) {
    if (!audioUnlocked || muted || !audioCtx || document.hidden) return;
    if (now - lastActive < CONFIG.jazz.t1) return;
    if (now >= nextRumbleT) {
      playIdleRumble(audioCtx.currentTime + 0.01);
      nextRumbleT = now + rand(CONFIG.idleAudio.rumbleMin, CONFIG.idleAudio.rumbleMax);
    }
    if (now >= nextCrackleT) {
      playIdleCrackle(audioCtx.currentTime + 0.01);
      nextCrackleT = now + rand(CONFIG.idleAudio.tickMin, CONFIG.idleAudio.tickMax);
    }
  }

  function loop(now) {
    var dt = clamp(now - last, 0, 34);
    last = now;
    if (isSmashState()) stepSmash(now);
    else if (state === ST.FLY_LAP) stepLap(now);
    else if (state === ST.IDLE_JAZZ) stepJazz(now);
    else if (state === ST.FOLLOW) {
      followStep(fol, dt, now);
      face = fol.face;
      var bob = reduceMotion ? 0 : Math.sin(now / 320) * 3.2;
      place("fly", fol.cx, fol.cy + bob, sizes.fly, reduceMotion ? 0 : fol.bank, 1, 1);
      checkJazz(now);
      checkLap(now);
    } else {
      stepStand(now);
      checkJazz(now);
      checkLap(now);
    }
    if (fx) drawFx(dt);
    pumpIdleAudio(now);
    armIdleAudio(now);
    maybeSleep(now);
    if (raf) raf = requestAnimationFrame(loop); // maybeSleep may have put us to sleep
  }

  // P0: sleep after 1s idle; wake on events or when the next jazz tier / idle sound is due
  function maybeSleep(now) {
    if (isSmashState() || state === ST.IDLE_JAZZ || state === ST.FLY_LAP) return;
    if (particles.length || bolts.length || shocks.length || flash > 0) return;
    if (now - lastActive < CONFIG.sleepMs) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    armIdleWake(now);
  }
  function armIdleWake(now) {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (document.hidden) return;
    var idle = now - lastActive;
    var next = Infinity;
    var tiers = [CONFIG.jazz.t1, CONFIG.jazz.t2, CONFIG.jazz.t3];
    for (var i = 0; i < 3; i++) {
      if (!jazz.tierFired[i]) next = Math.min(next, tiers[i] - idle);
    }
    if (nextRumbleT > now) next = Math.min(next, nextRumbleT - now);
    if (nextCrackleT > now) next = Math.min(next, nextCrackleT - now);
    if (!isFinite(next) || next < 0) return;
    idleTimer = window.setTimeout(function () {
      idleTimer = 0;
      if (document.hidden) return;
      wake();
    }, Math.max(50, next));
  }
  function wake() {
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = 0; }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function noteActive() {
    lastActive = performance.now();
    jazz.tierFired = [false, false, false];
    wake();
  }

  /* ---------- input ---------- */
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    noteActive();
    var px = e.clientX - 28, py = e.clientY - 36;
    if (Math.abs(px - fol.tx) > 4 || Math.abs(py - fol.ty) > 4) fol.stillT = performance.now();
    fol.tx = px; fol.ty = py;
    if (!seenPointer) {
      seenPointer = true;
      fol.cx = px; fol.cy = py;
      if (!shouldSmashMode() && !isSmashState()) setState(ST.FOLLOW); // P0: follow wired
    } else if (!shouldSmashMode() && !isSmashState() && state === ST.STAND) {
      setState(ST.FOLLOW);
    }
  }
  function onKey() { noteActive(); }
  function onScroll() {
    lastScrollT = performance.now();
    noteActive();
  }
  var downPos = null;
  function onPointerDown(e) {
    // P0 economy: no AudioContext on every pointerdown — created lazily at smash
    downPos = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType || "mouse" };
    noteActive();
  }
  function tapMoved(e) {
    if (!downPos || downPos.type === "mouse") return false;
    var dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    return Math.sqrt(dx * dx + dy * dy) > 24;
  }
  function chosenLink(node) {
    if (!node || !node.closest) return null;
    if (node.closest("[data-tg-ignore], #tg-audio, .veer-fab, .veer-panel, input, textarea, select")) return null;
    var a = node.closest("a[href]");
    if (!a || a.closest("[data-tg-ignore], .veer-fab, .veer-panel")) return null;
    var href = a.getAttribute("href") || "";
    if (!href || href === "#" || href.charAt(0) === "#") return null; // P0: never hijack same-page anchors
    if (href.indexOf("javascript:") === 0) return null;
    return a;
  }
  function linkText(a) {
    var t = (a.textContent || a.getAttribute("aria-label") || a.getAttribute("href") || "link").trim();
    return t.length > 60 ? t.slice(0, 57) + "..." : t;
  }
  function markChoice(el) {
    clearMark();
    if (!el) return;
    smash.mark = { el: el, outline: el.style.outline, offset: el.style.outlineOffset };
    el.style.outline = "2px solid var(--accent, #0e7490)";
    el.style.outlineOffset = "3px";
  }
  function ignoreTarget(node) {
    if (!node || !node.closest) return false;
    return !!node.closest("[data-tg-ignore], .veer-fab, .veer-panel, input, textarea, select, button");
  }

  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.button && e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var now = performance.now();
    if (downPos && downPos.type !== "mouse") { // touch misfire guards
      if (now - lastScrollT < 350 || tapMoved(e)) return;
    }
    noteActive();
    if (isSmashState()) return; // P0: re-entrancy guard (also fixes the go-wipe bug)
    var a = chosenLink(e.target);
    // same-page '#' anchor (or other link chosenLink declines): plain click, never smash
    if (!a && e.target && e.target.closest && e.target.closest("a[href]")) return;
    if (a) {
      var box = a.getBoundingClientRect();
      var ax = box.left + box.width * 0.5;
      var ay = box.top + Math.min(box.height * 0.45, 52);
      var blank = a.target === "_blank";
      var url = a.href;
      announce("Opening " + linkText(a));
      if (blank) {
        // Safari blocks delayed window.open — fire synchronously in the click handler
        try { window.open(url, "_blank", "noopener"); } catch (err) { /* blocked */ }
        startSmash(ax, ay, { link: false });
        return;
      }
      e.preventDefault();
      markChoice(a);
      startSmash(ax, ay, { link: true, go: url, blank: false });
      return;
    }
    if (ignoreTarget(e.target)) return;
    startSmash(e.clientX, e.clientY, { link: false }); // P0: desktop clicks are live input now
  }

  function onResize() { readSizes(); resizeFx(); noteActive(); }
  function onVis() {
    if (document.visibilityState === "visible") {
      noteActive();
      if (audioCtx && audioCtx.state === "suspended" && audioUnlocked) audioCtx.resume();
    } else if (raf) { cancelAnimationFrame(raf); raf = 0; } // hidden tab: full sleep
  }
  function onClipFail() { // P0 watchdog: error path can no longer strand the mascot
    if (isSmashState() && smash.useClip) { smash.useClip = false; clip.style.opacity = "0"; endSmash(); }
  }
  clip.addEventListener("error", onClipFail);

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("keydown", onKey, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);

  /* ---------- boot ---------- */
  wake();
  syncTheme();
  var themeObs = new MutationObserver(syncTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  var colorMql = null;
  var colorHandler = function () { syncTheme(); };
  try {
    colorMql = window.matchMedia("(prefers-color-scheme: dark)");
    if (colorMql.addEventListener) colorMql.addEventListener("change", colorHandler);
    else if (colorMql.addListener) colorMql.addListener(colorHandler);
  } catch (e) { /* older browsers */ }

  var api = {
    smash: function (x, y) {
      return startSmash(typeof x === "number" ? x : window.innerWidth * 0.5, typeof y === "number" ? y : window.innerHeight * 0.45, { link: false });
    },
    setMode: function (mode) {
      if (mode) document.documentElement.dataset.thunderMode = mode;
      else delete document.documentElement.dataset.thunderMode;
      if (!shouldSmashMode() && seenPointer && !isSmashState()) setState(ST.FOLLOW);
      else if (shouldSmashMode() && !isSmashState()) setState(ST.STAND);
      wake();
    },
    getState: function () { return state; },
    destroy: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (idleTimer) window.clearTimeout(idleTimer);
      if (copyTimer) window.clearTimeout(copyTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      clip.removeEventListener("error", onClipFail);
      try { themeObs.disconnect(); } catch (e) { /* noop */ }
      try {
        if (colorMql) {
          if (colorMql.removeEventListener) colorMql.removeEventListener("change", colorHandler);
          else if (colorMql.removeListener) colorMql.removeListener(colorHandler);
        }
      } catch (e) { /* noop */ }
      try { if (audioCtx && audioCtx.close) audioCtx.close(); } catch (e) { /* noop */ }
      style.remove();
      if (canvas) canvas.remove();
      hero.remove();
      clip.remove();
      copyEl.remove();
      liveEl.remove();
      btn.remove();
      document.documentElement.classList.remove("tg-shake");
      if (window.__thunderGuard === api) delete window.__thunderGuard;
      if (window.ThunderGuard === api) delete window.ThunderGuard;
    },
    // test hooks (not public API)
    _internals: {
      ST: ST,
      CONFIG: CONFIG,
      followStep: followStep,
      anchorCalc: anchorCalc,
      smashPhase: smashPhase,
      smashTimeline: smashTimeline,
      chosenLink: chosenLink,
      sizes: function () { return sizes; },
      fxCounts: function () { return { particles: particles.length, bolts: bolts.length, shocks: shocks.length }; },
      noteActive: noteActive
    }
  };
  window.__thunderGuard = api;
  window.ThunderGuard = api;
})();
