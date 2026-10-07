/* Storm guard. He leans on the hero banner and waits.
   Now and then he flies a lap and comes back to that lean.
   A chosen link: he flies in, faces it, hammers it, then the page loads. */
(function () {
  if (window.__thunderGuard) {
    try { window.__thunderGuard.destroy(); } catch (e) { /* replace a hot reload */ }
  }

  var scriptSrc = document.currentScript && document.currentScript.src;
  var asset = function (name) {
    return scriptSrc ? new URL(name, scriptSrc).href : "assets/" + name;
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FLY_W = 124;
  var SMASH_W = 210;
  var STAND_W = 148;

  var poses = {
    fly: { img: new Image(), aspect: 560 / 379 },
    smash: { img: new Image(), aspect: 593 / 640 },
    stand: { img: new Image(), aspect: 1102 / 1700 }
  };
  poses.fly.img.decoding = "async";
  poses.smash.img.decoding = "async";
  poses.stand.img.decoding = "async";
  poses.fly.img.src = asset("thunder-fly.webp");
  poses.smash.img.src = asset("thunder-smash.webp");
  poses.stand.img.src = asset("thunder-stand.webp");
  poses.fly.img.onload = function () {
    if (poses.fly.img.naturalHeight) poses.fly.aspect = poses.fly.img.naturalWidth / poses.fly.img.naturalHeight;
  };
  poses.smash.img.onload = function () {
    if (poses.smash.img.naturalHeight) poses.smash.aspect = poses.smash.img.naturalWidth / poses.smash.img.naturalHeight;
  };
  poses.stand.img.onload = function () {
    if (poses.stand.img.naturalHeight) poses.stand.aspect = poses.stand.img.naturalWidth / poses.stand.img.naturalHeight;
  };

  var style = document.createElement("style");
  style.textContent = [
    "#tg-fx,#tg-hero{position:fixed;left:0;top:0;pointer-events:none;z-index:70}",
    "#tg-fx{width:100%;height:100%;z-index:69}",
    "#tg-hero{transform-origin:center center;will-change:transform;filter:drop-shadow(0 14px 16px rgba(0,0,0,.35))}",
    "#tg-audio{position:fixed;z-index:74;left:max(0.75rem,env(safe-area-inset-left));bottom:max(0.75rem,env(safe-area-inset-bottom));",
    "width:2.25rem;height:2.25rem;display:grid;place-items:center;border-radius:999px;cursor:pointer;opacity:.72;",
    "color:#0f1b26;background:rgba(255,255,255,.9);border:1px solid #dbe3ea;",
    "box-shadow:0 4px 14px rgba(15,27,38,.12)}",
    "#tg-audio:hover,#tg-audio:focus-visible{opacity:1}",
    "#tg-audio svg{width:1rem;height:1rem}",
    "#tg-audio[data-muted='1']{color:#4a5968;opacity:.55}",
    "@media (prefers-reduced-motion: reduce){html.tg-shake body{animation:none !important}}",
    "@keyframes tg-shake{0%{transform:translate(0,0)}15%{transform:translate(-6px,3px)}30%{transform:translate(7px,-3px)}45%{transform:translate(-5px,-2px)}60%{transform:translate(4px,2px)}80%{transform:translate(-2px,1px)}100%{transform:translate(0,0)}}",
    "html.tg-shake body{animation:tg-shake .72s ease-out}"
  ].join("");
  document.head.appendChild(style);

  var canvas = null;
  var fx = null;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "tg-fx";
    fx = canvas.getContext("2d");
    document.body.insertBefore(canvas, hero);
    resize();
  }
  var hero = document.createElement("img");
  hero.id = "tg-hero";
  hero.alt = "";
  hero.setAttribute("aria-hidden", "true");
  hero.draggable = false;
  hero.style.opacity = "0";
  var btn = document.createElement("button");
  btn.id = "tg-audio";
  btn.type = "button";
  btn.setAttribute("data-tg-ignore", "");
  document.body.appendChild(hero);
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
    btn.dataset.muted = muted ? "1" : "0";
    btn.setAttribute("aria-pressed", muted ? "false" : "true");
    btn.setAttribute("aria-label", muted ? "Storm sounds off. Turn them on." : "Storm sounds on. Turn them off.");
    btn.innerHTML = boltIcon(muted);
  }
  paintBtn();

  var audioCtx = null;
  var master = null;
  var noiseBuf = null;
  var audioUnlocked = false;

  function unlockAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      audioCtx = new AC({ latencyHint: "interactive" });
      master = audioCtx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(audioCtx.destination);
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
      master.gain.setTargetAtTime(muted ? 0 : 0.85, audioCtx.currentTime, 0.02);
    }
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    unlockAudio();
    setMuted(!muted);
  });

  function noiseBurst(when, dur, opt) {
    if (!audioCtx || muted) return;
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
    g.connect(master);
    src.start(when);
    src.stop(when + dur + 0.03);
  }

  function tone(when, freq, dur, peak, type, slide) {
    if (!audioCtx || muted) return;
    var o = audioCtx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(Math.max(30, freq), when);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), when + dur);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function playWhoosh(when, peak) {
    noiseBurst(when, 0.5, { type: "bandpass", freq: 1500, q: 0.85, peak: peak, sweepTo: 180 });
    noiseBurst(when, 0.36, { type: "highpass", freq: 700, q: 0.4, peak: peak * 0.45, sweepTo: 160 });
  }
  function playCrack(when) {
    noiseBurst(when, 0.16, { type: "highpass", freq: 2200, q: 0.55, peak: 0.34 });
    tone(when, 1680, 0.07, 0.07, "square", 320);
  }
  function playRumble(when) {
    tone(when, 52, 0.7, 0.26, "sine", 36);
    noiseBurst(when, 0.75, { type: "lowpass", freq: 260, q: 0.7, peak: 0.18, sweepTo: 70 });
  }
  function playBoom(when) {
    tone(when, 82, 0.42, 0.5, "sine", 32);
    tone(when, 46, 0.55, 0.36, "sine", 26);
    noiseBurst(when, 0.2, { type: "lowpass", freq: 160, q: 0.5, peak: 0.32, sweepTo: 50 });
  }
  function playBlast(when) {
    noiseBurst(when, 0.2, { type: "highpass", freq: 1600, q: 0.45, peak: 0.46 });
    tone(when, 740, 0.1, 0.1, "square", 160);
    noiseBurst(when, 0.32, { type: "bandpass", freq: 520, q: 0.7, peak: 0.26, sweepTo: 120 });
  }
  function playThunder(when) {
    tone(when, 54, 1.2, 0.4, "sine", 28);
    tone(when + 0.1, 40, 1.35, 0.3, "sine", 22);
    noiseBurst(when, 1.3, { type: "lowpass", freq: 280, q: 0.45, peak: 0.3, sweepTo: 48 });
  }
  function playHit(when) {
    var partials = [118, 176, 263, 397, 610, 890];
    for (var i = 0; i < partials.length; i++) {
      var f = partials[i] * (1 + Math.random() * 0.012);
      tone(when, f, Math.max(0.16, 0.48 - i * 0.045), Math.max(0.05, 0.16 - i * 0.016), "triangle", f * 0.7);
    }
    tone(when, 60, 0.34, 0.42, "sine", 36);
    noiseBurst(when, 0.1, { type: "highpass", freq: 980, q: 0.45, peak: 0.42 });
    noiseBurst(when + 0.02, 1.15, { type: "lowpass", freq: 400, q: 0.55, peak: 0.3, sweepTo: 70 });
    tone(when + 0.03, 46, 1.05, 0.32, "sine", 30);
  }

  function isSmashMode() {
    var forced = document.documentElement.dataset.thunderMode;
    if (forced === "smash") return true;
    if (forced === "follow") return false;
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    var noHover = window.matchMedia("(hover: none)").matches;
    return coarse && noHover;
  }

  function ignoreTarget(node) {
    if (!node || !node.closest) return false;
    return !!node.closest("[data-tg-ignore], .veer-fab, .veer-panel, input, textarea, select, button");
  }

  var cx = -200;
  var cy = 40;
  var vx = 0;
  var vy = 0;
  var tx = 0;
  var ty = 0;
  var face = 1;
  var bank = 0;
  var seenPointer = false;
  var lastWhoosh = 0;
  var poseName = "";

  var rest = { mode: "stand", nextLap: 0, lapT: 0 };

  function standAnchor() {
    var el = document.querySelector(".hero h1") || document.querySelector(".hero") || document.querySelector("header");
    var r = el ? el.getBoundingClientRect() : { left: 16, top: 96, right: 280, bottom: 220, width: 264, height: 124 };
    var x = r.right + 28;
    var y = r.top + r.height * 0.62;
    if (x > window.innerWidth - 64) {
      x = Math.max(64, window.innerWidth - 72);
      y = Math.min(window.innerHeight - 90, r.bottom + 8);
    }
    return { x: x, y: y, face: 1 };
  }

  function stepStand(now) {
    if (!rest.nextLap) rest.nextLap = now + 6000;
    if (!reduceMotion && now > rest.nextLap) {
      rest.mode = "lap";
      rest.lapT = now;
      if (audioUnlocked && !muted && audioCtx) playWhoosh(audioCtx.currentTime, 0.045);
      return;
    }
    var a = standAnchor();
    face = a.face;
    var breathe = reduceMotion ? 0 : Math.sin(now / 980) * 1.8;
    var glance = reduceMotion ? 0 : Math.sin(now / 1600) * 2.4;
    place("stand", a.x, a.y + breathe, Math.min(STAND_W, window.innerWidth * 0.38), a.face * 6 + glance, 1, 1);
  }

  function stepLap(now) {
    var t = (now - rest.lapT) / 4600;
    var a = standAnchor();
    if (t >= 1) {
      rest.mode = "stand";
      rest.nextLap = now + 18000 + Math.random() * 10000;
      stepStand(now);
      return;
    }
    var ang = t * Math.PI * 2;
    var rx = Math.min(180, window.innerWidth * 0.22);
    var ry = Math.min(72, window.innerHeight * 0.1);
    face = Math.cos(ang) > 0 ? -1 : 1;
    var fade = t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1;
    place("fly", a.x + Math.cos(ang) * rx, a.y - 30 + Math.sin(ang) * ry, FLY_W, 0, fade, 1);
  }

  var smash = {
    active: false,
    t0: 0,
    x: 0,
    y: 0,
    face: 1,
    fromX: 0,
    fromY: 0,
    ctrlX: 0,
    ctrlY: 0,
    hit: false,
    go: "",
    blank: false
  };

  var particles = [];
  var bolts = [];
  var shocks = [];
  var flash = 0;

  function quad(a, b, c, t) {
    var u = 1 - t;
    return u * u * a + 2 * u * t * b + t * t * c;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }

  function makeBolt(x1, y1, x2, y2, jag) {
    var pts = [{ x: x1, y: y1 }];
    function seg(a, b, depth, j) {
      if (depth === 0) { pts.push(b); return; }
      var m = {
        x: (a.x + b.x) / 2 + (Math.random() - 0.5) * j,
        y: (a.y + b.y) / 2 + (Math.random() - 0.5) * j
      };
      seg(a, m, depth - 1, j * 0.55);
      seg(m, b, depth - 1, j * 0.55);
    }
    seg({ x: x1, y: y1 }, { x: x2, y: y2 }, 5, jag || 70);
    return { pts: pts, life: 0.85, max: 0.85 };
  }

  function burst(x, y) {
    var colors = ["#f7fbff", "#9ad7ff", "#e8b15a", "#ffffff"];
    for (var i = 0; i < 56; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 0.7 + Math.random() * 3.4;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2.2,
        life: 0.9 + Math.random() * 0.8,
        max: 1.7,
        r: 1.2 + Math.random() * 2.4,
        color: colors[i % colors.length]
      });
    }
    shocks.push({ x: x, y: y, life: 1.15, max: 1.15 });
    shocks.push({ x: x, y: y, life: 0.85, max: 0.85 });
    bolts.push(makeBolt(x + (Math.random() * 120 - 60), -20, x, y, 90));
    bolts.push(makeBolt(x - 40, -10, x + 16, y - 8, 60));
    bolts.push(makeBolt(x + 30, 0, x - 10, y + 6, 50));
    flash = 0.42;
    if (!reduceMotion) {
      document.documentElement.classList.remove("tg-shake");
      void document.documentElement.offsetWidth;
      document.documentElement.classList.add("tg-shake");
      window.setTimeout(function () {
        document.documentElement.classList.remove("tg-shake");
      }, 780);
    }
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

  function hideHero() {
    hero.style.opacity = "0";
  }

  function startSmash(x, y) {
    rest.mode = "stand";
    ensureCanvas();
    var ac = unlockAudio();
    smash.active = true;
    smash.t0 = performance.now();
    smash.x = x;
    smash.y = y;
    smash.hit = false;
    smash.rattled = false;
    smash.face = x < window.innerWidth * 0.5 ? -1 : 1;
    face = smash.face;
    smash.fromX = smash.face === 1 ? -190 : window.innerWidth + 190;
    smash.fromY = clamp(y - 280, 20, window.innerHeight * 0.45);
    smash.ctrlX = (smash.fromX + x) / 2;
    smash.ctrlY = Math.min(smash.fromY, y) - 170;
    bolts.push(makeBolt(smash.fromX * 0.3 + x * 0.2, -10, x, Math.max(30, y - 80), 80));
    if (ac && !muted) {
      var t0 = ac.currentTime + 0.01;
      if (reduceMotion) {
        playBoom(t0);
        playBlast(t0 + 0.16);
        playThunder(t0 + 0.34);
      } else {
        playWhoosh(t0, 0.16);
      }
    }
    wake();
  }

  function clearMark() {
    if (!smash.mark) return;
    smash.mark.el.style.outline = smash.mark.outline;
    smash.mark.el.style.outlineOffset = smash.mark.offset;
    smash.mark = null;
  }

  function endSmash() {
    smash.active = false;
    hideHero();
    clearMark();
    var url = smash.go;
    var blank = smash.blank;
    smash.go = "";
    smash.blank = false;
    if (!url) return;
    if (blank) window.open(url, "_blank", "noopener");
    else window.location.assign(url);
  }

  function impactCenter(sw, sh) {
    var hx = 0.2;
    var hy = 0.26;
    return {
      x: smash.x - smash.face * hx * sw,
      y: smash.y - hy * sh
    };
  }

  function stepSmash(now) {
    var t = (now - smash.t0) / 1000;
    var sw = Math.min(SMASH_W, window.innerWidth * 0.72);
    var fw = Math.min(FLY_W, window.innerWidth * 0.5);
    var hit = impactCenter(sw, sw / poses.smash.aspect);
    face = smash.face;

    var lookX = smash.x - smash.face * 72;
    var lookY = smash.y - 64;

    if (reduceMotion) {
      var a = t < 0.08 ? t / 0.08 : 1;
      if (!smash.hit && t > 0.05) {
        smash.hit = true;
        burst(smash.x, smash.y);
      }
      place("smash", hit.x, hit.y, sw, 0, a, 1);
      if (t > 0.7) endSmash();
      return;
    }

    if (t < 0.85) {
      var u = easeOut(t / 0.85);
      var px = quad(smash.fromX, smash.ctrlX, lookX, u);
      var py = quad(smash.fromY, smash.ctrlY, lookY, u);
      place("fly", px, py, fw, lerp(smash.face * -14, smash.face * 8, u), 1, lerp(0.7, 1, u));
    } else if (t < 1.4) {
      var s = (t - 0.85) / 0.55;
      place("fly", lookX, lookY + Math.sin(s * Math.PI) * 3, fw, smash.face * 10, 1, 1.02);
    } else if (t < 1.82) {
      var d = easeIn((t - 1.4) / 0.42);
      place("smash", lerp(lookX, hit.x, d), lerp(lookY, hit.y, d), sw, lerp(smash.face * 8, smash.face * 4, d), 1, lerp(1.02, 1.14, d));
    } else if (t < 2.7) {
      if (!smash.hit) {
        smash.hit = true;
        burst(smash.x, smash.y);
        if (audioUnlocked && !muted && audioCtx) {
          var now = audioCtx.currentTime + 0.01;
          playBoom(now);
          playBlast(now + 0.18);
          playThunder(now + 0.38);
        }
      }
      var h = (t - 1.82) / 0.88;
      place("smash", hit.x, hit.y, sw, smash.face * 2 * (1 - h), 1, lerp(1.14, 1.05, Math.min(1, h)));
    } else {
      endSmash();
    }
  }

  function stepFollow(dt, now) {
    if (!seenPointer) {
      hideHero();
      return;
    }
    var pull = 1 - Math.exp(-dt / 70);
    vx += (tx - cx) * 0.018 * (dt / 16);
    vy += (ty - cy) * 0.018 * (dt / 16);
    var drag = Math.pow(0.82, dt / 16);
    vx *= drag;
    vy *= drag;
    cx += vx * (dt / 16);
    cy += vy * (dt / 16);
    if (vx > 0.45) face = 1;
    else if (vx < -0.45) face = -1;
    var targetBank = clamp(vy * 1.15, -18, 18);
    bank += (targetBank - bank) * (1 - Math.exp(-dt / 90));
    var bob = reduceMotion ? 0 : Math.sin(now / 320) * 3.2;
    var speed = Math.hypot(vx, vy);
    if (!reduceMotion && audioUnlocked && !muted && speed > 14 && now - lastWhoosh > 2400 && audioCtx) {
      playWhoosh(audioCtx.currentTime, 0.03);
      lastWhoosh = now;
    }
    place("fly", cx, cy + bob, Math.min(FLY_W, window.innerWidth * 0.42), reduceMotion ? 0 : bank, 1, 1);
  }

  function resize() {
    if (!canvas || !fx) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function drawFx(dt) {
    if (!fx) return;
    fx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    var dim = 0;
    if (smash.active) {
      var t = (performance.now() - smash.t0) / 1000;
      if (t > 1.75 && t < 2.45) dim = 0.16;
    }
    if (dim > 0.01) {
      fx.fillStyle = "rgba(5,8,14," + dim + ")";
      fx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    if (flash > 0) {
      fx.fillStyle = "rgba(214,236,255," + Math.min(0.85, flash * 4) + ")";
      fx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      flash = Math.max(0, flash - dt / 1000);
    }
    for (var i = bolts.length - 1; i >= 0; i--) {
      var b = bolts[i];
      b.life -= dt / 1000;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      var alpha = b.life / b.max;
      fx.beginPath();
      fx.moveTo(b.pts[0].x, b.pts[0].y);
      for (var p = 1; p < b.pts.length; p++) fx.lineTo(b.pts[p].x, b.pts[p].y);
      fx.strokeStyle = "rgba(232,246,255," + alpha + ")";
      fx.lineWidth = 3.2;
      fx.shadowColor = "rgba(120,200,255,.9)";
      fx.shadowBlur = 16;
      fx.stroke();
      fx.lineWidth = 1.2;
      fx.shadowBlur = 0;
      fx.strokeStyle = "rgba(255,255,255," + alpha + ")";
      fx.stroke();
    }
    fx.shadowBlur = 0;
    for (var s = shocks.length - 1; s >= 0; s--) {
      var ring = shocks[s];
      ring.life -= dt / 1000;
      if (ring.life <= 0) { shocks.splice(s, 1); continue; }
      var u = 1 - ring.life / ring.max;
      fx.beginPath();
      fx.arc(ring.x, ring.y, 16 + u * 150, 0, Math.PI * 2);
      fx.strokeStyle = "rgba(180,220,255," + (ring.life / ring.max) * 0.85 + ")";
      fx.lineWidth = 3 * (1 - u);
      fx.stroke();
    }
    for (var k = particles.length - 1; k >= 0; k--) {
      var pt = particles[k];
      pt.life -= dt / 1000;
      if (pt.life <= 0) { particles.splice(k, 1); continue; }
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

  var raf = 0;
  var last = performance.now();
  function loop(now) {
    var dt = clamp(now - last, 0, 34);
    last = now;
    if (smash.active) stepSmash(now);
    else if (rest.mode === "lap") stepLap(now);
    else stepStand(now);
    if (fx) drawFx(dt);
    raf = requestAnimationFrame(loop);
  }
  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  wake();

  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (isSmashMode()) return;
    seenPointer = true;
    tx = e.clientX - 28;
    ty = e.clientY - 36;
    wake();
  }
  function chosenLink(node) {
    if (!node || !node.closest) return null;
    if (node.closest("[data-tg-ignore], #tg-audio, .veer-fab, .veer-panel, input, textarea, select")) return null;
    var a = node.closest("a[href]");
    if (!a || a.closest("[data-tg-ignore], .veer-fab, .veer-panel")) return null;
    var href = a.getAttribute("href") || "";
    if (!href || href === "#" || href.indexOf("javascript:") === 0) return null;
    return a;
  }

  function markChoice(el) {
    clearMark();
    if (!el) return;
    smash.mark = { el: el, outline: el.style.outline, offset: el.style.outlineOffset };
    el.style.outline = "2px solid #0e7490";
    el.style.outlineOffset = "3px";
  }

  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.button && e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = chosenLink(e.target);
    if (a) {
      e.preventDefault();
      var box = a.getBoundingClientRect();
      smash.go = a.href;
      smash.blank = a.target === "_blank";
      markChoice(a);
      startSmash(box.left + box.width * 0.5, box.top + Math.min(box.height * 0.45, 52));
      return;
    }
    smash.go = "";
    smash.blank = false;
    if (!isSmashMode()) return;
    if (ignoreTarget(e.target)) return;
    startSmash(e.clientX, e.clientY);
  }
  function onPointerDown() {
    unlockAudio();
  }
  function onResize() { resize(); }
  function onVis() {
    if (document.visibilityState === "visible" && audioCtx && audioCtx.state === "suspended" && audioUnlocked) {
      audioCtx.resume();
    }
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);

  var api = {
    smash: function (x, y) {
      startSmash(typeof x === "number" ? x : window.innerWidth * 0.5, typeof y === "number" ? y : window.innerHeight * 0.45);
    },
    setMode: function (mode) {
      if (mode) document.documentElement.dataset.thunderMode = mode;
      else delete document.documentElement.dataset.thunderMode;
      if (!isSmashMode()) wake();
      else if (!smash.active) hideHero();
    },
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      style.remove();
      if (canvas) canvas.remove();
      hero.remove();
      btn.remove();
      document.documentElement.classList.remove("tg-shake");
      if (window.__thunderGuard === api) delete window.__thunderGuard;
    }
  };
  window.__thunderGuard = api;
  window.ThunderGuard = api;
})();
