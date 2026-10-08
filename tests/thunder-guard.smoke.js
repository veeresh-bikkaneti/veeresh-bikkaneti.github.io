// tests/thunder-guard.smoke.js
// DOM-stubbed smoke + regression tests for assets/thunder-guard.js
// Run: node tests/thunder-guard.smoke.js   (no dependencies)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "assets", "thunder-guard.js"), "utf8");

let passed = 0, failed = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { passed++; return; }
  failed++; failures.push(name);
  console.error("  FAIL:", name);
}

function makeCtx2d() {
  const calls = [];
  const ctx = { calls };
  ["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "setTransform"]
    .forEach(m => { ctx[m] = function () { calls.push(m); }; });
  return ctx;
}

function makeEl(tag, sb) {
  const listeners = {};
  const cls = new Set();
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    src: "",
    readyState: 0,
    currentTime: 0,
    duration: 0,
    ended: false,
    videoWidth: 0,
    videoHeight: 0,
    playbackRate: 1,
    classList: {
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains(c) { return cls.has(c); }
    },
    setAttribute(k, v) { el["_attr_" + k] = String(v); },
    getAttribute(k) { const v = el["_attr_" + k]; return v === undefined ? null : v; },
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    remove() { el._removed = true; },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
    _fire(t, ev) { (listeners[t] || []).slice().forEach(f => f(ev)); },
    getContext() { el._ctx = el._ctx || makeCtx2d(); return el._ctx; },
    play() { el._played = (el._played || 0) + 1; return Promise.resolve(); },
    pause() { el._paused = true; },
    load() { el._loaded = true; },
    decode() { return Promise.resolve(); },
    querySelector() { return null; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }; }
  };
  sb.created.push(el);
  return el;
}

function makeSandbox(opts) {
  opts = opts || {};
  const sb = { created: [] };
  sb.now = 1000000;
  sb.lastRafCb = null;
  let rafId = 0;
  const winListeners = {};
  const docListeners = {};
  sb.timers = new Set();

  const store = {};
  if (opts.localStorage) Object.assign(store, opts.localStorage);
  sb.localStorage = {
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  };

  const mm = opts.matchMedia || {};
  const matchMedia = q => ({
    matches: !!mm[q],
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });

  const opened = [];
  const assigned = [];
  sb.opened = opened;
  sb.assigned = assigned;
  const selectionText = opts.selection || "";

  const window = sb.window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    matchMedia,
    addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
    removeEventListener(t, f) { winListeners[t] = (winListeners[t] || []).filter(x => x !== f); },
    getSelection() { return { toString() { return selectionText; } }; },
    open(url, target, feats) { opened.push({ url, target, feats }); return null; },
    location: { assign(url) { assigned.push(url); }, href: "https://example.com/" },
    requestAnimationFrame(cb) { sb.lastRafCb = cb; return ++rafId; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) { const t = setTimeout(fn, ms); if (t.unref) t.unref(); sb.timers.add(t); return t; },
    clearTimeout(t) { clearTimeout(t); sb.timers.delete(t); }
  };
  if (opts.AudioContext) window.AudioContext = opts.AudioContext;

  const body = makeEl("body", sb);
  const head = makeEl("head", sb);
  const docEl = makeEl("html", sb);
  const document = sb.document = {
    currentScript: null,
    documentElement: docEl,
    head, body,
    hidden: false,
    visibilityState: "visible",
    activeElement: null,
    createElement(t) { return makeEl(t, sb); },
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener(t, f) { docListeners[t] = (docListeners[t] || []).filter(x => x !== f); },
    querySelector() { return null; }
  };

  sb.fireWin = function (type, ev) {
    ev = ev || {}; ev.type = type;
    (winListeners[type] || []).slice().forEach(f => f(ev));
    return ev;
  };
  sb.fireDoc = function (type, ev) {
    ev = ev || {}; ev.type = type;
    (docListeners[type] || []).slice().forEach(f => f(ev));
    return ev;
  };
  sb.advance = ms => { sb.now += ms; };
  sb.step = () => { const cb = sb.lastRafCb; if (cb) cb(sb.now); };
  sb.clickEvent = function (target, x, y) {
    return {
      target, clientX: x == null ? 400 : x, clientY: y == null ? 300 : y,
      button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
  };
  sb.makeLink = function (href, target) {
    const el = makeEl("a", sb);
    el.href = href;
    el.target = target || "";
    el.textContent = "Test link";
    el.getAttribute = k => (k === "href" ? href : (k === "target" ? (target || null) : null));
    el.closest = sel => (sel === "a[href]" ? el : null);
    el.getBoundingClientRect = () => ({ left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20 });
    return el;
  };
  sb.makeDiv = () => makeEl("div", sb);

  const ctx = {
    window, document,
    performance: { now: () => sb.now },
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    localStorage: sb.localStorage,
    Image: function Image() { return makeEl("img", sb); },
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    console
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "thunder-guard.js" });
  sb.api = window.__thunderGuard;
  return sb;
}

function run() {
  // 1. boot
  {
    const sb = makeSandbox();
    ok(!!sb.api, "boot: api exposed");
    ok(sb.api.getState() === "STAND", "boot: initial state STAND");
  }

  // 2. pointermove -> FOLLOW
  {
    const sb = makeSandbox();
    sb.fireWin("pointermove", { clientX: 500, clientY: 300 });
    ok(sb.api.getState() === "FOLLOW", "pointermove: STAND -> FOLLOW");
  }

  // 3. REG P0-2: fly sprite loads on follow entry
  {
    const sb = makeSandbox();
    sb.fireWin("pointermove", { clientX: 500, clientY: 300 });
    sb.step();
    const hero = sb.created.find(e => e.id === "tg-hero");
    ok(hero && hero.src.indexOf("thunder-fly.webp") !== -1,
      "P0-2: fly sprite set on first pointermove (src=" + (hero && hero.src) + ")");
  }

  // 4. idle 2.2s -> IDLE_JAZZ (tier-1)
  {
    const sb = makeSandbox();
    for (let i = 0; i < 9; i++) { sb.advance(250); sb.step(); }
    ok(sb.api.getState() === "IDLE_JAZZ",
      "idle 2.2s: tier-1 jazz fires (state=" + sb.api.getState() + ")");
  }

  // 5. tap smash -> impact FX counts, then completes
  {
    const sb = makeSandbox();
    sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 400, 300));
    ok(/SMASH/.test(sb.api.getState()), "tap: enters smash (state=" + sb.api.getState() + ")");
    for (let i = 0; i < 14; i++) { sb.advance(50); sb.step(); } // 700ms, past impact
    const c = sb.api._internals.fxCounts();
    ok(c.particles === 56, "tap smash: 56 particles (got " + c.particles + ")");
    ok(c.shocks === 2, "tap smash: 2 shockwaves (got " + c.shocks + ")");
    ok(c.bolts >= 2, "tap smash: bolts present (got " + c.bolts + ")");
    for (let i = 0; i < 40; i++) { sb.advance(50); sb.step(); } // to ~2.7s
    ok(!/SMASH/.test(sb.api.getState()), "tap smash: completes (state=" + sb.api.getState() + ")");
  }

  // 6. re-entrancy guard
  {
    const sb = makeSandbox();
    sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 400, 300));
    ok(sb.api.smash(100, 100) === false, "re-entrancy: api.smash during smash returns false");
  }

  // 7. '#' anchor exempt
  {
    const sb = makeSandbox();
    const a = sb.makeLink("#", "");
    const ev = sb.clickEvent(a, 150, 110);
    sb.fireDoc("click", ev);
    ok(!ev.defaultPrevented, "'#': never hijacked");
    ok(sb.api.getState() === "STAND", "'#': no smash (state=" + sb.api.getState() + ")");
  }

  // 8. link click -> smash -> nav fires post-smash
  {
    const sb = makeSandbox();
    const a = sb.makeLink("https://example.com/page", "");
    const ev = sb.clickEvent(a, 150, 110);
    sb.fireDoc("click", ev);
    ok(ev.defaultPrevented, "link: default prevented for smash");
    for (let i = 0; i < 32; i++) { sb.advance(50); sb.step(); } // 1.6s > 1.39s link timeline
    ok(sb.assigned.indexOf("https://example.com/page") !== -1, "link: navigates after smash");
  }

  // 9. REG P0-4: _blank opens exactly one tab
  {
    const sb = makeSandbox();
    const a = sb.makeLink("https://example.com/ext", "_blank");
    const ev = sb.clickEvent(a, 150, 110);
    sb.fireDoc("click", ev);
    ok(ev.defaultPrevented, "P0-4: _blank preventDefault'd");
    ok(sb.opened.length === 1, "P0-4: exactly one tab (got " + sb.opened.length + ")");
  }

  // 10. REG P0-1: throttled state + link click -> nav still fires
  {
    const sb = makeSandbox();
    sb.api._internals._testSpam(); // 4 taps inside the 2s window
    sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 400, 300)); // 5th tap -> throttle, sparkle-only
    ok(!/SMASH/.test(sb.api.getState()), "P0-1: throttled tap is sparkle-only, no smash");
    const a = sb.makeLink("https://example.com/page", "");
    const ev = sb.clickEvent(a, 150, 110);
    sb.fireDoc("click", ev); // link smashes are exempt from the tap economy
    ok(ev.defaultPrevented, "P0-1: link smash proceeds despite throttle");
    for (let i = 0; i < 32; i++) { sb.advance(50); sb.step(); }
    ok(sb.assigned.indexOf("https://example.com/page") !== -1, "P0-1: throttled link click still navigates");
  }

  // 11. REG P0-3: throwing AudioContext -> click doesn't die, nav fires
  {
    const sb = makeSandbox({ AudioContext: class { constructor() { throw new Error("denied"); } } });
    const a = sb.makeLink("https://example.com/page", "");
    let threw = null;
    try {
      sb.fireDoc("click", sb.clickEvent(a, 150, 110));
      for (let i = 0; i < 32; i++) { sb.advance(50); sb.step(); }
    } catch (e) { threw = e; }
    ok(!threw, "P0-3: AudioContext throw doesn't kill the click" + (threw ? " (" + threw.message + ")" : ""));
    ok(sb.assigned.indexOf("https://example.com/page") !== -1, "P0-3: nav still fires");
  }

  // 12. P1-24: second click during link smash -> immediate nav
  {
    const sb = makeSandbox();
    const a = sb.makeLink("https://example.com/page", "");
    sb.fireDoc("click", sb.clickEvent(a, 150, 110));
    ok(/SMASH/.test(sb.api.getState()), "P1-24: link smash active");
    sb.fireDoc("click", sb.clickEvent(a, 150, 110));
    ok(sb.assigned.indexOf("https://example.com/page") !== -1, "P1-24: second click navigates immediately");
  }

  // 13. reduced motion: no auto-laps over 60s
  {
    const sb = makeSandbox({ matchMedia: { "(prefers-reduced-motion: reduce)": true } });
    for (let i = 0; i < 60; i++) { sb.advance(1000); sb.step(); }
    ok(sb.api.getState() === "STAND",
      "P1-5: no auto-laps under reduced motion (state=" + sb.api.getState() + ")");
  }

  // 14. reduced motion: smash completes without throwing
  {
    const sb = makeSandbox({ matchMedia: { "(prefers-reduced-motion: reduce)": true } });
    let threw = null;
    try {
      sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 400, 300));
      for (let i = 0; i < 20; i++) { sb.advance(50); sb.step(); }
    } catch (e) { threw = e; }
    ok(!threw, "P1-5: reduced-motion smash doesn't throw" + (threw ? " (" + threw.message + ")" : ""));
    ok(!/SMASH/.test(sb.api.getState()),
      "P1-5: reduced-motion smash completes (state=" + sb.api.getState() + ")");
  }

  // 15. form focus: no jazz over a focused field
  {
    const sb = makeSandbox();
    sb.document.activeElement = { tagName: "INPUT" };
    for (let i = 0; i < 12; i++) { sb.advance(250); sb.step(); }
    ok(sb.api.getState() === "STAND",
      "P1-15: no jazz over focused form (state=" + sb.api.getState() + ")");
  }

  // 16. drag-select guard
  {
    const sb = makeSandbox();
    sb.fireWin("pointerdown", { clientX: 100, clientY: 100, pointerType: "mouse" });
    sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 200, 200));
    ok(!/SMASH/.test(sb.api.getState()), "P1-12: drag is not a smash");
  }

  // 17. text-selection guard
  {
    const sb = makeSandbox({ selection: "some selected text" });
    sb.fireWin("pointerdown", { clientX: 100, clientY: 100, pointerType: "mouse" });
    sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 102, 101));
    ok(!/SMASH/.test(sb.api.getState()), "P1-12: text selection is not a smash");
  }

  // 18. mute toggle
  {
    const sb = makeSandbox();
    const btn = sb.created.find(e => e.id === "tg-audio");
    ok(!!btn, "mute button exists");
    btn._fire("click", { stopPropagation() {} });
    ok(btn.getAttribute("aria-pressed") === "true", "mute: aria-pressed=true when muted");
    ok(sb.localStorage.getItem("tg-muted") === "1", "mute: persisted to localStorage");
  }

  // 19. destroy tears down
  {
    const sb = makeSandbox();
    sb.api.destroy();
    let threw = null;
    try {
      sb.fireDoc("click", sb.clickEvent(sb.makeDiv(), 400, 300));
      sb.fireWin("pointermove", { clientX: 1, clientY: 1 });
    } catch (e) { threw = e; }
    ok(!threw, "destroy: no listeners fire after teardown");
    ok(sb.window.__thunderGuard === undefined, "destroy: deregisters api");
  }

  // 20. size fallback tiers
  {
    const sb = makeSandbox();
    ok(sb.api._internals.sizes().fly === 104, "sizes: CSS-var fallback (fly=104)");
  }

  // 21. P1-6: follow integrates velocity exactly once per step
  {
    const sb = makeSandbox();
    const f = sb.api._internals.followStep;
    const st = { cx: 0, cy: 0, vx: 10, vy: 0, tx: 500, ty: 0, face: 1, faceT: 0, bank: 0, stillT: 0 };
    f(st, 33.334, sb.now + 5000); // n=2: old code moved 2*vx
    ok(Math.abs(st.cx - st.vx) < 1e-9,
      "P1-6: displacement applied once (dx=" + st.cx.toFixed(4) + ", vx=" + st.vx.toFixed(4) + ")");
  }

  // 22. follow physics moves toward the cursor
  {
    const sb = makeSandbox();
    const f = sb.api._internals.followStep;
    const st = { cx: 0, cy: 0, vx: 0, vy: 0, tx: 500, ty: 0, face: 1, faceT: 0, bank: 0, stillT: sb.now };
    f(st, 16.667, sb.now + 100);
    ok(st.cx > 0, "follow: moves toward cursor (cx=" + st.cx.toFixed(2) + ")");
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failures.length) console.log("failures:", failures);
  process.exit(failed ? 1 : 0);
}

run();
