/* hero3d.js — dotted-globe (Three.js r160). DPR capped + step-down;
 * reduced-motion = 1 static frame. 6 draw calls. */
import * as THREE from './vendor/three.module.min.js';
import { LAND_POINTS } from './land-points.js';
let started = false;
// lon/lat -> unit sphere, Atlantic framing (centre +15).
function ll2v(lon, lat, r) {
  const lo = (lon + 15) * Math.PI / 180, la = lat * Math.PI / 180;
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}
const geo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g; };
export function initHero3D() {
  if (started) return;
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;
  started = true;
  const hero = canvas.closest('.hero') || canvas.parentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { canvas.remove(); return; }
  let raf = 0, ro = null, io = null, stopped = false;
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
  const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); offs.splice(0).forEach((f) => f()); };
  on(canvas, 'webglcontextlost', () => { stop(); canvas.remove(); });
  try {
    let pr = Math.min(devicePixelRatio || 1, hero.clientWidth < 640 ? 1.25 : 1.5);
    renderer.setPixelRatio(pr);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50); cam.position.set(0, 0, 4.4);
    const globe = new THREE.Group(); scene.add(globe);
    let sr = null; // reduced-motion only
    const landPos = new Float32Array(LAND_POINTS.length / 2 * 3);
    for (let i = 0, j = 0; i < LAND_POINTS.length; i += 2, j += 3) { const v = ll2v(LAND_POINTS[i], LAND_POINTS[i + 1], 1); landPos[j] = v.x; landPos[j + 1] = v.y; landPos[j + 2] = v.z; }
    const landMat = new THREE.PointsMaterial({ color: 0xe2cda4, size: 0.016, transparent: true, opacity: 0.95 });
    globe.add(new THREE.Points(geo(landPos), landMat));
    const oPos = new Float32Array(1100 * 3);
    for (let i = 0; i < 1100; i++) { const y = 1 - (i / 1099) * 2, r = Math.sqrt(1 - y * y), t = i * 2.39996; oPos[i * 3] = Math.cos(t) * r; oPos[i * 3 + 1] = y; oPos[i * 3 + 2] = Math.sin(t) * r; }
    const oceanMat = new THREE.PointsMaterial({ size: 0.008, transparent: true, opacity: 0.14 });
    globe.add(new THREE.Points(geo(oPos), oceanMat));
    const gratMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.13 });
    const gPos = [], push2 = (arr, a, b) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let lat = -60; lat <= 60; lat += 20) { let p = null; for (let lon = -180; lon <= 180; lon += 3) { const v = ll2v(lon, lat, 1.002); if (p) push2(gPos, p, v); p = v; } }
    for (let lon = -180; lon < 180; lon += 20) { let p = null; for (let lat = -84; lat <= 84; lat += 3) { const v = ll2v(lon, lat, 1.002); if (p) push2(gPos, p, v); p = v; } }
    globe.add(new THREE.LineSegments(geo(new Float32Array(gPos)), gratMat));
    const ringMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 });
    const rPos = [];
    [[1.22, -0.45, 0.2], [1.36, 0.3, -0.15], [1.5, -0.08, 0.35]].forEach(([r, rx, rz]) => {
      const e = new THREE.Euler(rx, 0, rz); let p = null, first = null;
      for (let a = 0; a < Math.PI * 2; a += 0.05) { const v = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r).applyEuler(e); if (p) push2(rPos, p, v); if (!first) first = v; p = v; }
      if (p && first) push2(rPos, p, first);
    });
    const rings = new THREE.Group();
    rings.add(new THREE.LineSegments(geo(new Float32Array(rPos)), ringMat));
    globe.add(rings);
    const sat = new THREE.Points(geo(new Float32Array([1.5, 0, 0])), new THREE.PointsMaterial({ color: 0xac8a5c, size: 0.05, transparent: true, opacity: 0.95 }));
    globe.add(sat);
    const dPos = new Float32Array(140 * 3);
    for (let i = 0; i < 140; i++) { dPos[i * 3] = (Math.random() - 0.5) * 7; dPos[i * 3 + 1] = (Math.random() - 0.5) * 3.4; dPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5; }
    const dust = new THREE.Points(geo(dPos), new THREE.PointsMaterial({ color: 0xfff6dd, size: 0.02, transparent: true, opacity: 0.5 }));
    scene.add(dust);
    const applyTheme = () => {
      const cs = getComputedStyle(document.documentElement);
      const text = cs.getPropertyValue('--text').trim() || '#232529', tan = cs.getPropertyValue('--tan').trim() || '#ac8a5c';
      oceanMat.color.set(text); gratMat.color.set(text); ringMat.color.set(tan); sat.material.color.set(tan);
      if (sr) sr();
    };
    applyTheme();
    const toggle = document.getElementById('theme-toggle');
    if (toggle) on(toggle, 'click', () => requestAnimationFrame(applyTheme));
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    if (scheme.addEventListener) on(scheme, 'change', applyTheme);
    let baseY = 0.12;
    const place = () => {
      const w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      const wide = w >= 832; baseY = wide ? 0.12 : 0.75;
      globe.position.set(wide ? 1.55 : 0.9, baseY, 0);
      globe.scale.setScalar(wide ? 1.18 : 0.72);
      if (sr) sr();
    };
    place();
    if ('ResizeObserver' in window) { ro = new ResizeObserver(place); ro.observe(hero); }
    if (reduced) { globe.rotation.set(0.28, 0.5, 0); sr = () => renderer.render(scene, cam); sr(); return; }
    let mx = 0, my = 0, tmx = 0, tmy = 0, scrollP = 0, tScroll = 0, inView = true, running = true, sDirty = true;
    on(window, 'pointermove', (e) => { tmx = (e.clientX / innerWidth - 0.5) * 2; tmy = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
    on(window, 'scroll', () => { sDirty = true; }, { passive: true });
    on(document, 'visibilitychange', () => { running = !document.hidden; });
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; }); io.observe(hero); }
    // DPR step-down: EMA>24ms ~90 frames -> 1.5->1.25->1.0, max 2, never up.
    let ema = 16, slow = 0, steps = 0, lastT = performance.now(), lastStyleP = -1;
    const clock = new THREE.Clock();
    (function tick() {
      raf = requestAnimationFrame(tick);
      if (!inView || !running || stopped) return;
      const now = performance.now(), dt = now - lastT; lastT = now;
      if (dt > 100) { ema = 16; slow = 0; }
      else { ema = ema * 0.95 + dt * 0.05; if (ema > 24 && ++slow >= 90 && steps < 2) { const next = pr > 1.25 ? 1.25 : 1.0; if (next < pr) { pr = next; steps++; renderer.setPixelRatio(pr); renderer.setSize(hero.clientWidth, hero.clientHeight, false); } slow = 0; ema = 16; } else if (ema <= 24) slow = 0; }
      if (sDirty) { sDirty = false; const r = hero.getBoundingClientRect(); tScroll = THREE.MathUtils.clamp(-r.top / Math.max(r.height, 1), 0, 1); }
      const t = clock.getElapsedTime();
      mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04; scrollP += (tScroll - scrollP) * 0.06;
      globe.rotation.y = 0.5 + t * 0.02 + scrollP * 0.55 + mx * 0.10;
      globe.rotation.x = 0.28 + Math.sin(t * 0.11) * 0.02 - my * 0.05;
      globe.position.y = baseY + Math.sin(t * 0.4) * 0.02;
      rings.rotation.y = t * 0.03;
      const a = t * 0.25; sat.position.set(Math.cos(a) * 1.5, Math.sin(a * 0.9) * 0.22, Math.sin(a) * 1.5);
      landMat.size = 0.016 + Math.sin(t * 0.8) * 0.0016;
      dust.rotation.y = t * 0.008; dust.position.y = Math.sin(t * 0.13) * 0.05;
      if (Math.abs(scrollP - lastStyleP) > 0.001) { lastStyleP = scrollP; canvas.style.transform = 'translateY(' + (scrollP * 46) + 'px) scale(' + (1 + scrollP * 0.05) + ')'; canvas.style.opacity = String(1 - scrollP * 0.55); }
      renderer.render(scene, cam);
    })();
  } catch { stop(); canvas.remove(); }
}
