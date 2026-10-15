/* hero3d.js — editorial dotted-globe scene for the portfolio hero.
 *
 * One ES module, loaded lazily (requestIdleCallback) by an inline script in
 * index.html. Imports the vendored Three.js r160 and the real land points
 * sampled from Natural Earth polygons (assets/land-points.js).
 *
 * Hard rules (from the plan): hero only, decorative (canvas is aria-hidden
 * and pointer-events:none), no post-processing, no lights/shadows/textures,
 * DPR capped, lerped pointer/scroll (never 1:1), pauses off-screen and when
 * the tab is hidden, prefers-reduced-motion renders exactly one static
 * frame, and any failure removes the canvas leaving the page untouched.
 */
import * as THREE from './vendor/three.module.min.js';
import { LAND_POINTS } from './land-points.js';

/* lon/lat (degrees) -> Vector3 on a unit sphere, framed on the Atlantic
   (centre longitude +15) like the approved reference. */
function ll2v(lon, lat, r) {
  const lo = (lon + 15) * Math.PI / 180;
  const la = lat * Math.PI / 180;
  return new THREE.Vector3(
    r * Math.cos(la) * Math.sin(lo),
    r * Math.sin(la),
    r * Math.cos(la) * Math.cos(lo)
  );
}

export function initHero3D() {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;
  const hero = canvas.closest('.hero') || canvas.parentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: 'low-power'
    });
  } catch (e) {
    canvas.remove();
    return;
  }
  canvas.addEventListener('webglcontextlost', () => canvas.remove());

  try {
    const dprCap = () => Math.min(window.devicePixelRatio || 1, hero.clientWidth < 640 ? 1.25 : 1.5);
    renderer.setPixelRatio(dprCap());

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    cam.position.set(0, 0, 4.4);
    const globe = new THREE.Group();
    scene.add(globe);

    /* Token-driven colours: land stays warm tan; ocean dots and graticule
       take the theme's text colour at low opacity; rings take --tan.
       Re-read on theme toggle / OS scheme change (no scene rebuild). */
    const styles = getComputedStyle(document.documentElement);
    const token = (name, fallback) => (styles.getPropertyValue(name).trim() || fallback);

    // Land points — real coastlines from LAND_POINTS (flat lon,lat pairs).
    const landPos = new Float32Array(LAND_POINTS.length / 2 * 3);
    for (let i = 0, j = 0; i < LAND_POINTS.length; i += 2, j += 3) {
      const v = ll2v(LAND_POINTS[i], LAND_POINTS[i + 1], 1);
      landPos[j] = v.x; landPos[j + 1] = v.y; landPos[j + 2] = v.z;
    }
    const landGeo = new THREE.BufferGeometry();
    landGeo.setAttribute('position', new THREE.BufferAttribute(landPos, 3));
    const landMat = new THREE.PointsMaterial({
      color: 0xe2cda4, size: 0.016, transparent: true, opacity: 0.95, sizeAttenuation: true
    });
    globe.add(new THREE.Points(landGeo, landMat));

    // Faint ocean dots (fibonacci sphere) so the globe reads round.
    const OCEAN = 1100;
    const oPos = new Float32Array(OCEAN * 3);
    for (let i = 0; i < OCEAN; i++) {
      const y = 1 - (i / (OCEAN - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * 2.39996;
      oPos[i * 3] = Math.cos(t) * r; oPos[i * 3 + 1] = y; oPos[i * 3 + 2] = Math.sin(t) * r;
    }
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.BufferAttribute(oPos, 3));
    const oceanMat = new THREE.PointsMaterial({ size: 0.008, transparent: true, opacity: 0.14 });
    globe.add(new THREE.Points(oGeo, oceanMat));

    // Graticule.
    const gratMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.13 });
    for (let lat = -60; lat <= 60; lat += 20) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 3) pts.push(ll2v(lon, lat, 1.002));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }
    for (let lon = -180; lon < 180; lon += 20) {
      const pts = [];
      for (let lat = -84; lat <= 84; lat += 3) pts.push(ll2v(lon, lat, 1.002));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }

    // Orbit rings + one satellite point riding the outer ring.
    const ringMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 });
    const rings = new THREE.Group();
    [[1.22, -0.45, 0.2], [1.36, 0.3, -0.15], [1.5, -0.08, 0.35]].forEach(([r, rx, rz]) => {
      const pts = [];
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
      ring.rotation.set(rx, 0, rz);
      rings.add(ring);
    });
    globe.add(rings);
    const sat = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.5, 0, 0)]),
      new THREE.PointsMaterial({ color: 0xac8a5c, size: 0.05, transparent: true, opacity: 0.95 })
    );
    globe.add(sat);

    // Drifting dust in the hero air.
    const DUST = 140;
    const dPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dPos[i * 3] = (Math.random() - 0.5) * 7;
      dPos[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
      dPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
      color: 0xfff6dd, size: 0.02, transparent: true, opacity: 0.5
    }));
    scene.add(dust);

    const applyTheme = () => {
      const cs = getComputedStyle(document.documentElement);
      const text = cs.getPropertyValue('--text').trim() || '#232529';
      const tan = cs.getPropertyValue('--tan').trim() || '#ac8a5c';
      oceanMat.color.set(text);
      gratMat.color.set(text);
      ringMat.color.set(tan);
      sat.material.color.set(tan);
    };
    applyTheme();
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.addEventListener('click', () => requestAnimationFrame(applyTheme));
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (scheme.addEventListener) scheme.addEventListener('change', applyTheme);

    let baseY = 0.12;
    const place = () => {
      const w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(dprCap());
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const wide = w >= 832;
      baseY = wide ? 0.12 : 0.75;
      globe.position.set(wide ? 1.55 : 0.9, baseY, 0);
      globe.scale.setScalar(wide ? 1.18 : 0.72);
    };
    place();
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(hero);

    // Reduced motion: exactly one static frame, no loop, no listeners.
    if (reduced) {
      globe.rotation.set(0.28, 0.5, 0);
      renderer.render(scene, cam);
      return;
    }

    let mx = 0, my = 0, tmx = 0, tmy = 0;
    let scrollP = 0, tScroll = 0;
    let inView = true, running = true;
    window.addEventListener('pointermove', (e) => {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('scroll', () => {
      const r = hero.getBoundingClientRect();
      tScroll = THREE.MathUtils.clamp(-r.top / Math.max(r.height, 1), 0, 1);
    }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => { running = !document.hidden; });

    const clock = new THREE.Clock();
    (function tick() {
      requestAnimationFrame(tick);
      if (!inView || !running) return;
      const t = clock.getElapsedTime();
      mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;      // lerped, never 1:1
      scrollP += (tScroll - scrollP) * 0.06;
      globe.rotation.y = 0.5 + t * 0.02 + scrollP * 0.55 + mx * 0.10;
      globe.rotation.x = 0.28 + Math.sin(t * 0.11) * 0.02 - my * 0.05;
      globe.position.y = baseY + Math.sin(t * 0.4) * 0.02;
      rings.rotation.y = t * 0.03;
      const a = t * 0.25;
      sat.position.set(Math.cos(a) * 1.5, Math.sin(a * 0.9) * 0.22, Math.sin(a) * 1.5);
      landMat.size = 0.016 + Math.sin(t * 0.8) * 0.0016;    // a breath, not a blink
      dust.rotation.y = t * 0.008;
      dust.position.y = Math.sin(t * 0.13) * 0.05;
      canvas.style.transform = 'translateY(' + (scrollP * 46) + 'px) scale(' + (1 + scrollP * 0.05) + ')';
      canvas.style.opacity = String(1 - scrollP * 0.55);
      renderer.render(scene, cam);
    })();
  } catch (e) {
    canvas.remove();
  }
}

export { initHero3D as init };
