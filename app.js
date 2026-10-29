import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { toCreasedNormals } from './vendor/BufferGeometryUtils.js';

const $ = (s) => document.querySelector(s);
const status = (t, err = false) => { const e = $('#status'); e.textContent = t; e.classList.toggle('err', err); };

// ---------- parameter spec (names = Kotlin Params fields) ----------
const SPEC = [
  { g: 'main', n: 'neckD', l: 'Neck diameter', min: 2.5, max: 8, step: 0.1, d: 4 },
  { g: 'main', n: 'miswakD', l: 'Miswak stick diameter', min: 3, max: 9, step: 0.1, d: 5 },
  { g: 'main', n: 'threadPitch', l: 'Thread pitch', min: 0.8, max: 2.5, step: 0.05, d: 1.25 },
  { g: 'main', n: 'threadClear', l: 'Thread clearance', min: 0, max: 0.6, step: 0.05, d: 0.4 },
  { g: 'main', n: 'handleLen', l: 'Handle length', min: 20, max: 140, step: 1, d: 85 },
  { g: 'main', n: 'boreRound', l: 'Bore shape', type: 'select', opts: [[0, 'hex'], [1, 'round']], d: 0 },
  { g: 'adv', n: 'boreFit', l: 'Bore fit (af − stick Ø)', min: -0.5, max: 0.6, step: 0.05, d: -0.15 },
  { g: 'adv', n: 'boreDepth', l: 'Bore depth', min: 4, max: 14, step: 0.5, d: 8.5 },
  { g: 'adv', n: 'headD', l: 'Head diameter', min: 7, max: 14, step: 0.1, d: 9 },
  { g: 'adv', n: 'neckHold', l: 'Straight neck length', min: 2, max: 30, step: 1, d: 6 },
  { g: 'adv', n: 'bendR', l: 'Bend radius', min: 6, max: 20, step: 0.5, d: 10 },
  { g: 'adv', n: 'handleDBottom', l: 'Handle Ø bottom', min: 6, max: 16, step: 0.5, d: 10 },
  { g: 'adv', n: 'handleDTop', l: 'Handle Ø top', min: 4, max: 12, step: 0.5, d: 6 },
  { g: 'adv', n: 'threadLen', l: 'Thread length', min: 4, max: 12, step: 0.5, d: 5.5 },
  { g: 'adv', n: 'coneAngle', l: 'Head cone angle °', min: 12, max: 45, step: 1, d: 20 },
  { g: 'adv', n: 'coneBaseR', l: 'Cone base radius', min: 3, max: 4.5, step: 0.05, d: 3.7 },
  { g: 'adv', n: 'fingerTipR', l: 'Finger tip radius', min: 2.8, max: 4, step: 0.05, d: 3.15 },
  { g: 'adv', n: 'clampTravel', l: 'Clamp travel', min: 0, max: 2.5, step: 0.1, d: 1.2 },
  { g: 'adv', n: 'slitW', l: 'Slit width', min: 0.4, max: 1.6, step: 0.05, d: 0.8 },
  { g: 'adv', n: 'slitLen', l: 'Slit length', min: 3, max: 11, step: 0.5, d: 6.5 },
  { g: 'cap', n: 'capFlutes', l: 'Cap flutes', min: 0, max: 16, step: 1, d: 10 },
  { g: 'cap', n: 'capThreadDepth', l: 'Cap thread depth', min: 3, max: 8, step: 0.5, d: 5 },
  { g: 'cap', n: 'capOdBase', l: 'Cap OD base', min: 11, max: 18, step: 0.1, d: 12.4 },
  { g: 'cap', n: 'capOdTop', l: 'Cap OD top', min: 9, max: 16, step: 0.1, d: 10.4 },
  { g: 'el', n: 'stemD', l: 'Stem Ø (electric)', min: 6, max: 16, step: 0.1, d: 11 },
  { g: 'el', n: 'stemClear', l: 'Stem clearance', min: 0, max: 0.5, step: 0.05, d: 0.2 },
  { g: 'el', n: 'socketDepth', l: 'Socket depth', min: 8, max: 28, step: 1, d: 18 },
  { g: 'el', n: 'stemFlat', l: 'Stem flat', min: 0, max: 3, step: 0.1, d: 0 },
  { g: 'q', n: 'threadN', l: 'Mesh quality (nodes/turn)', min: 36, max: 160, step: 4, d: 72 },
];
const GROUPS = { main: null, adv: 'Advanced head / handle', cap: 'Cap', el: 'Electric socket (placeholder)', q: 'Quality' };
const vals = Object.fromEntries(SPEC.map((s) => [s.n, s.d]));
const explode = { v: 22 };

// ---------- Kotlin/Wasm ----------
let K = null, io = null, wasmMem = null;
async function loadKotlin() {
  if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly unavailable');
  K = await import('./kotlin/miswak.mjs');
  io = await import('./kotlin/miswak.import-object.mjs');
  wasmMem = io.importObject.intrinsics.memory; // avoids the deprecated `memory` re-export proxy
}

function build(kind) {
  for (const s of SPEC) K.setParam(s.n, Number(vals[s.n]));
  const t0 = performance.now();
  K.generate(kind);
  let pos, idx;
  K.copyOut((pv, nf, pi, ni) => {
    pos = new Float32Array(wasmMem.buffer, pv, nf).slice();
    idx = new Int32Array(wasmMem.buffer, pi, ni).slice();
  });
  const info = JSON.parse(K.infoJson());
  info.ms = performance.now() - t0;
  return { kind, pos, idx, info };
}

// ---------- three.js scene ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
camera.up.set(0, 0, 1);
camera.position.set(220, -260, 150);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x303038, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(150, -200, 250); scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.9); rim.position.set(-200, 150, 50); scene.add(rim);
const grid = new THREE.GridHelper(200, 20, 0x39404c, 0x262b34); grid.rotation.x = Math.PI / 2; scene.add(grid);
const group = new THREE.Group(); scene.add(group);
const matBody = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.55, metalness: 0.05 });
const matCap = new THREE.MeshStandardMaterial({ color: 0x6fa8dc, roughness: 0.45, metalness: 0.05 });

function toGeometry(part) {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  g.setIndex(new THREE.BufferAttribute(part.idx, 1));
  g = toCreasedNormals(g, THREE.MathUtils.degToRad(38));
  g.computeBoundingBox();
  return g;
}

let mode = 'manual';
let variant = 'manual';
const cache = {};
let current = {};
let framed = false;

function capMatrix(head, cap, exploded) {
  const xe = head.info.xe, ye = head.info.ye, ze = head.info.ze;
  const dX = cap.info.capDelta, al = cap.info.capAlpha;
  // cap local (x,y,z) -> model (z, y, -x), spun by capAlpha about the head axis (+X), moved onto the thread
  const B = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
  const R = new THREE.Matrix4().makeRotationX(al);
  const T = new THREE.Matrix4().makeTranslation(xe + dX + (exploded ? explode.v : 0), ye, ze);
  return T.multiply(R).multiply(B);
}

function partsFor(m) {
  if (m === 'manual' || m === 'electric') return [m];
  if (m === 'cap') return ['cap'];
  return [variant, 'cap'];
}

let pending = null, timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 60); }

function refresh() {
  if (!K) return;
  try {
    const kinds = partsFor(mode);
    const needed = new Set([...kinds, 'manual', 'electric', 'cap']); // keep exports current
    for (const k of needed) if (kinds.includes(k) || !cache[k]) { /* build lazily below */ }
    for (const k of kinds) cache[k] = build(k);
    for (const k of ['manual', 'electric', 'cap']) if (!kinds.includes(k)) delete cache[k]; // stale
    render();
  } catch (e) { console.error(e); status('error: ' + e.message, true); }
}

function render() {
  while (group.children.length) { const o = group.children.pop(); o.geometry.dispose(); }
  const kinds = partsFor(mode);
  current = {};
  let tris = 0, ms = 0;
  for (const k of kinds) {
    const part = cache[k]; tris += part.info.triangles; ms += part.info.ms;
    const mesh = new THREE.Mesh(toGeometry(part), k === 'cap' ? matCap : matBody);
    if ((mode === 'assembled' || mode === 'exploded') && k === 'cap') {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(capMatrix(cache[variant], part, mode === 'exploded'));
    }
    group.add(mesh); current[k] = part;
  }
  const box = new THREE.Box3().setFromObject(group);
  if (!framed) {
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(c);
    const dist = (box.getSize(new THREE.Vector3()).length() / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
    camera.position.copy(c).add(new THREE.Vector3(0.9, -1.2, 0.55).normalize().multiplyScalar(dist));
    framed = true;
  }
  grid.position.z = box.min.z - 0.01;
  updateClip();
  const lines = [];
  for (const k of kinds) {
    const i = cache[k].info, b = i.bounds;
    lines.push(`${k}: ${i.triangles.toLocaleString()} tris, ${(i.volume / 1000).toFixed(2)} cm³, built in ${i.ms.toFixed(0)} ms`,
      `  size ${(b[3] - b[0]).toFixed(1)} × ${(b[4] - b[1]).toFixed(1)} × ${(b[5] - b[2]).toFixed(1)} mm (x,y,z model)`,
      `  closed surface: ${i.boundaryEdges === 0 && i.nonManifoldEdges === 0 && i.orientationErrors === 0 ? 'yes (watertight, consistent)' : 'NO — ' + i.boundaryEdges + ' open / ' + i.nonManifoldEdges + ' non-manifold'}`);
    if (k !== 'cap' && (i.headD !== vals.headD || Math.abs(i.fingerTipR - vals.fingerTipR) > 1e-6)) lines.push(`  effective head Ø ${i.headD.toFixed(2)}, finger tip R ${i.fingerTipR.toFixed(2)} (auto-fitted to the bore)`);
  }
  $('#info').textContent = lines.join('\n');
  updateFit();
  status(`Kotlin/Wasm · ${tris.toLocaleString()} triangles · ${ms.toFixed(0)} ms`);
  window.__ready = true;
}

// ---------- preset views (front = looking down the head axis, -X; side = bend plane, from -Y) ----------
const VIEWS = { front: [1, 0, 0], side: [0, -1, 0], iso: [0.9, -1.2, 0.55] };
function setView(name) {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const dist = (box.getSize(new THREE.Vector3()).length() / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(...VIEWS[name]).normalize().multiplyScalar(dist));
  camera.up.set(0, 0, 1); camera.lookAt(c); controls.update();
  document.querySelectorAll('#views button').forEach((x) => x.classList.toggle('on', x.dataset.view === name));
}

function resize() {
  const v = $('#view'), w = v.clientWidth, h = v.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
(function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();

// ---------- fit test panel (analytic checks computed in Kotlin) ----------
const fit = { tol: 0 };
function updateFit() {
  if (!K) return;
  for (const s of SPEC) K.setParam(s.n, Number(vals[s.n]));
  const el = (mode === 'electric') || ((mode === 'assembled' || mode === 'exploded') && variant === 'electric');
  const rows = JSON.parse(K.fitCheckJson(fit.tol, el));
  const worst = Math.max(...rows.map((r) => r.s));
  const name = ['PASS', 'CHECK', 'FAIL'][worst];
  $('#fitSummary').className = 'badge s' + worst;
  $('#fitSummary').textContent = name;
  let g = '', h = '';
  for (const r of rows) {
    if (r.g !== g) { g = r.g; h += `<tr class="grp"><td colspan="2">${g}</td></tr>`; }
    h += `<tr class="s${r.s}"><td><span class="dot"></span>${r.l}<div class="note">${r.n}</div></td><td class="v">${r.v}</td></tr>`;
  }
  $('#fitTable').innerHTML = h;
  window.__fit = rows;
}

// ---------- section plane (cut through the bend plane / head axis) ----------
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
renderer.localClippingEnabled = true;
function setSection(on) {
  for (const m of [matBody, matCap]) { m.clippingPlanes = on ? [clipPlane] : []; m.side = on ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; }
  section.on = on;
  updateClip();
}
const section = { on: false };
function updateClip() {
  const h = cache[variant] || cache.manual || cache.electric;
  const ye = mode === 'cap' ? 0 : (h ? h.info.ye : 0);
  clipPlane.constant = -ye; // keep y >= ye: the cut face looks at the default camera (-y side)
}

// ---------- UI ----------
function makeUI() {
  const host = $('#controls');
  const groups = {};
  for (const g of Object.keys(GROUPS)) {
    let el;
    if (GROUPS[g]) { el = document.createElement('details'); el.innerHTML = `<summary>${GROUPS[g]}</summary>`; }
    else el = document.createElement('div');
    host.appendChild(el); groups[g] = el;
  }
  for (const s of SPEC) {
    const c = document.createElement('div'); c.className = 'ctl';
    if (s.type === 'select') {
      c.innerHTML = `<div class="top"><label>${s.l}</label><select id="p_${s.n}">${s.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;
      groups[s.g].appendChild(c);
      c.querySelector('select').addEventListener('change', (e) => { vals[s.n] = Number(e.target.value); schedule(); });
    } else {
      c.innerHTML = `<div class="top"><label>${s.l}</label><input type="number" id="n_${s.n}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.d}"></div><input type="range" id="r_${s.n}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.d}">`;
      groups[s.g].appendChild(c);
      const r = c.querySelector('[type=range]'), n = c.querySelector('[type=number]');
      const set = (v) => { if (!isFinite(v)) return; vals[s.n] = v; r.value = v; if (document.activeElement !== n) n.value = v; schedule(); };
      r.addEventListener('input', () => { n.value = r.value; set(Number(r.value)); });
      n.addEventListener('input', () => set(Number(n.value)));
    }
  }
  // exploded distance
  const c = document.createElement('div'); c.className = 'ctl';
  c.innerHTML = `<div class="top"><label>Exploded distance (mm)</label><span id="exv">22</span></div><input type="range" min="5" max="60" step="1" value="22">`;
  c.querySelector('input').addEventListener('input', (e) => { explode.v = Number(e.target.value); $('#exv').textContent = explode.v; if (mode === 'exploded') render(); });
  c.id = 'exRow'; c.style.display = 'none'; $('#variantRow').after(c);

  document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('#modes button').forEach((x) => x.classList.toggle('on', x === b));
    $('#variantRow').style.display = (mode === 'assembled' || mode === 'exploded') ? '' : 'none';
    $('#exRow').style.display = mode === 'exploded' ? '' : 'none';
    framed = false; refresh();
  }));
  $('#variant').addEventListener('change', (e) => { variant = e.target.value; framed = false; refresh(); });
  $('#reset').addEventListener('click', () => {
    for (const s of SPEC) { vals[s.n] = s.d; const r = $('#r_' + s.n), n = $('#n_' + s.n), p = $('#p_' + s.n); if (r) { r.value = s.d; n.value = s.d; } if (p) p.value = s.d; }
    refresh();
  });
  $('#dlMain').addEventListener('click', () => download(mode === 'electric' || (variant === 'electric' && (mode === 'assembled' || mode === 'exploded')) ? 'electric' : 'manual'));
  $('#dlCap').addEventListener('click', () => download('cap'));
  const tr = $('#tol'), tv = $('#tolv');
  tr.addEventListener('input', () => { fit.tol = Number(tr.value); tv.textContent = (fit.tol > 0 ? '+' : fit.tol < 0 ? '−' : '±') + Math.abs(fit.tol).toFixed(2); updateFit(); });
  $('#section').addEventListener('change', (e) => setSection(e.target.checked));
}

// ---------- binary STL (print orientation as in the Python generator) ----------
function stlBytes(part) {
  const { pos, idx, kind } = part;
  const nv = pos.length / 3, P = new Float64Array(pos.length);
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (kind === 'cap') { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; }
    else { P[i * 3] = x; P[i * 3 + 1] = -z; P[i * 3 + 2] = y; } // rotate 90° about X: lay the part flat, handle along +Y
  }
  const mn = [Infinity, Infinity, Infinity];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) mn[a] = Math.min(mn[a], P[i * 3 + a]);
  const nt = idx.length / 3, buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const hdr = `miswak adapter ${kind} - Kotlin/Wasm generator`; for (let i = 0; i < hdr.length && i < 80; i++) dv.setUint8(i, hdr.charCodeAt(i));
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const k of [a, b, c]) { for (let q = 0; q < 3; q++) dv.setFloat32(o + q * 4, P[k + q] - mn[q], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
function download(kind) {
  try {
    const part = cache[kind] || build(kind);
    const bytes = stlBytes(part);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'model/stl' }));
    a.download = kind === 'cap' ? 'cap.stl' : `${kind}_adapter.stl`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { status('STL export failed: ' + e.message, true); }
}

// ---------- boot ----------
resize(); makeUI();
try {
  await loadKotlin();
  status('Kotlin/Wasm module loaded');
  refresh();
  window.miswak = { K, build, stlBytes, vals, refresh, get cache() { return cache; }, setSection: (on) => { $('#section').checked = on; setSection(on); }, setTol: (t) => { const r = $('#tol'); r.value = t; r.dispatchEvent(new Event('input')); }, setMode: (m) => document.querySelector(`#modes [data-mode=${m}]`).click(), setView, camera, controls };
} catch (e) {
  console.error(e);
  const f = $('#fallback'); f.hidden = false;
  f.innerHTML = `<div><h2>Could not start the Kotlin/Wasm module</h2><p>${e.message}</p><p>This page needs a browser with WebAssembly GC support: Chrome / Edge 119+, Firefox 120+, Safari 18.2+.</p></div>`;
  status('Wasm failed to load', true);
}
