import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createFX } from './fx.js';
import { scan, tierOf } from './signals.js';
import { initTurnstile, getToken } from './turnstile.js';
import { initMe } from './me.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ================================================================ renderer + camera + post
const canvas = $('c');
const stage = canvas.parentElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7d70b8');
scene.fog = new THREE.Fog('#7d70b8', 18, 36);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
const CAM = new THREE.Vector3(0.8, 3.7, 11.2), LOOK = new THREE.Vector3(0.2, 2.5, -0.6), SEAT = new THREE.Vector3(0, 2.0, 0);
camera.position.copy(CAM);
const fx = createFX(renderer, scene, camera, { bloom: 0.5, bloomThreshold: 0.86, bloomRadius: 0.55, tilt: 1.8, band: 0.2, focus: 0.5, vignette: 0.32, grain: 0.02, envIntensity: 0.4, exposure: 1.0 });
renderer.toneMapping = THREE.NeutralToneMapping;

// ================================================================ light
scene.add(new THREE.HemisphereLight('#f1e8ff', '#6f62a8', 0.75));
const moon = new THREE.DirectionalLight('#d6ceff', 1.35);
moon.position.set(-5, 8, -9);
moon.target.position.set(0.5, 0, 1);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
moon.shadow.bias = -0.0005;
scene.add(moon, moon.target);
const ectoLight = new THREE.PointLight('#8ff0c4', 0, 10, 1.6);
scene.add(ectoLight);
const lampLight = new THREE.PointLight('#ffb070', 0, 9, 1.4);
scene.add(lampLight);
const screenLight = new THREE.PointLight('#ff9fb8', 1.2, 6, 1.5);
scene.add(screenLight);

// ================================================================ canvas textures
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 8;
  return t;
}
const floorTex = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#b08c84'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) {
    const off = (y / 64) % 2 ? 180 : 0;
    for (let x = -off; x < w; x += 360) {
      const k = Math.random() * 14;
      g.fillStyle = `rgb(${206 - k},${172 - k},${160 - k})`;
      g.fillRect(x + 2, y + 2, 356, 60);
      g.strokeStyle = 'rgba(160,110,100,.08)';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x, y + 8 + k * 9 + Math.random() * 4); g.bezierCurveTo(x + 120, y + 6 + k * 9, x + 240, y + 12 + k * 9, x + 360, y + 8 + k * 9); g.stroke(); }
    }
  }
}, [4, 4]);
const wallTex = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#9486cc'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, 0, 30, h); }
  g.fillStyle = 'rgba(255,255,255,.16)';
  for (let y = 32; y < h; y += 64) for (let x = 16 + ((y / 64) % 2) * 32; x < w; x += 64) {
    g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 7, y); g.lineTo(x, y + 9); g.lineTo(x - 7, y); g.fill();
  }
}, [4, 2]);
const windowTex = tex(256, 320, (g) => {
  const grd = g.createLinearGradient(0, 0, 0, 320); grd.addColorStop(0, '#8c94e6'); grd.addColorStop(0.6, '#c3b2f2'); grd.addColorStop(1, '#f7c6d9');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; const x = Math.random() * 256, y = Math.random() * 190, r = Math.random() < 0.15 ? 2.2 : 1.2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = '#fff6dc'; g.shadowColor = '#fff6dc'; g.shadowBlur = 24; g.beginPath(); g.arc(178, 72, 28, 0, 7); g.fill(); g.shadowBlur = 0;
  g.fillStyle = '#a4a6ec'; g.beginPath(); g.arc(191, 63, 24, 0, 7); g.fill();
  // far hills, then trees
  g.fillStyle = '#a99ad8'; g.beginPath(); g.moveTo(0, 320); for (let x = 0; x <= 256; x += 8) g.lineTo(x, 250 - Math.sin(x * 0.03 + 1) * 18); g.lineTo(256, 320); g.fill();
  const tree = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.arc(x - r * 0.6, y + r * 0.4, r * 0.7, 0, 7); g.arc(x + r * 0.6, y + r * 0.4, r * 0.7, 0, 7); g.fill(); g.fillRect(x - 2, y + r * 0.6, 4, 30); };
  [[30, 262, 18, '#8ccfae'], [70, 272, 13, '#f2a9c4'], [120, 266, 16, '#9fd8b4'], [168, 274, 12, '#c9b1f0'], [214, 260, 20, '#8ccfae'], [248, 276, 12, '#f2a9c4']].forEach((t) => tree(...t));
  g.fillStyle = '#b6dcb0'; g.fillRect(0, 296, 256, 24);
  g.fillStyle = '#fffaf5';
  g.fillRect(124, 0, 8, 320); g.fillRect(0, 156, 256, 8);
  g.strokeStyle = '#fffaf5'; g.lineWidth = 16; g.strokeRect(0, 0, 256, 320);
});
const posterTex = tex(384, 512, (g) => {
  g.fillStyle = '#ffe38a'; g.fillRect(0, 0, 384, 512);
  g.fillStyle = '#2d2846'; g.font = '900 64px Arial'; g.textAlign = 'center';
  g.fillText("WE'RE", 192, 110); g.fillText('HIRING!', 192, 180);
  g.font = '700 28px Arial'; g.fillText('Join our family', 192, 240);
  g.fillStyle = '#ff9fb8'; g.beginPath(); g.arc(192, 350, 70, 0, 7); g.fill();
  g.fillStyle = '#ffe38a'; g.font = '900 60px Arial'; g.fillText('!!', 192, 372);
  g.fillStyle = '#2d2846'; g.font = '700 22px Arial'; g.fillText('Rockstars only.', 192, 470);
  g.fillText('Always hiring.', 192, 498);
});
const cvTex = tex(256, 360, (g) => {
  g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, 256, 360);
  g.fillStyle = '#2b2f45'; g.fillRect(20, 22, 130, 16); g.fillStyle = '#9aa0b8'; g.fillRect(20, 46, 90, 8);
  g.fillStyle = '#c9ccd8'; g.beginPath(); g.arc(210, 40, 22, 0, 7); g.fill();
  for (let s = 0; s < 3; s++) {
    g.fillStyle = '#5a5f78'; g.fillRect(20, 90 + s * 88, 70, 9);
    g.fillStyle = '#c9ccd8';
    for (let l = 0; l < 4; l++) g.fillRect(20, 108 + s * 88 + l * 14, 150 + Math.random() * 60, 6);
  }
});
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 512; screenCanvas.height = 300;
const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;

// ================================================================ the room
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const put = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

const floor = put(new THREE.PlaneGeometry(30, 30), std('#ffffff', { map: floorTex, roughness: 0.55, metalness: 0.1 }), 0, 0, 0);
floor.rotation.x = -Math.PI / 2;
put(new THREE.PlaneGeometry(30, 12), std('#ffffff', { map: wallTex, roughness: 0.9 }), 0, 6, -5.6);
const sideWall = put(new THREE.PlaneGeometry(20, 12), std('#ffffff', { map: wallTex, roughness: 0.9 }), -7.5, 6, 2);
sideWall.rotation.y = Math.PI / 2;
put(new THREE.BoxGeometry(30, 0.3, 0.1), std('#fffaf5'), 0, 0.15, -5.5);
put(new THREE.BoxGeometry(0.1, 0.3, 20), std('#fffaf5'), -7.45, 0.15, 2);

// window + moonbeam + dust
{
  const frame = put(new RoundedBoxGeometry(3.6, 4.4, 0.25, 2, 0.05), std('#fffaf5'), -3.6, 4.4, -5.55);
  frame.castShadow = false;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4), new THREE.MeshBasicMaterial({ map: windowTex, fog: false, toneMapped: false }));
  glass.position.set(-3.6, 4.4, -5.4);
  scene.add(glass);
  put(new THREE.BoxGeometry(3.9, 0.14, 0.45), std('#fffaf5'), -3.6, 2.15, -5.35);
}
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uAmt; varying vec2 vUv;
    void main(){ float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
      float len = smoothstep(0.0, 0.2, vUv.y) * (0.35 + 0.65 * vUv.y);
      float flick = 0.9 + 0.1 * sin(uTime * 0.7 + vUv.y * 6.0);
      gl_FragColor = vec4(vec3(1.0, 0.93, 1.0) * edge * len * 0.13 * flick * uAmt, 1.0); }`,
});
const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 11, 1, 1), beamMat);
beam.position.set(-2.2, 2.4, -1.6);
beam.rotation.set(-1.05, 0.3, 0.12);
scene.add(beam);
const DUST = 260;
const dustPos = new Float32Array(DUST * 3), dustSeed = Float32Array.from({ length: DUST }, () => Math.random());
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.035, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
dust.frustumCulled = false;
scene.add(dust);

// poster + clock on the back wall
const poster = put(new THREE.PlaneGeometry(1.7, 2.26), std('#ffffff', { map: posterTex, roughness: 0.8 }), 3.6, 5.1, -5.5);
poster.rotation.z = -0.04;
const clock = new THREE.Group();
clock.position.set(0.6, 6.7, -5.5);
put(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), std('#fffaf0'), 0, 0, 0, clock).rotation.x = Math.PI / 2;
put(new THREE.TorusGeometry(0.62, 0.06, 10, 40), std('#9d8cf2', { metalness: 0.2 }), 0, 0, 0.03, clock);
const hourGeo = new THREE.BoxGeometry(0.05, 0.34, 0.02).translate(0, 0.15, 0);
const minGeo = new THREE.BoxGeometry(0.035, 0.5, 0.02).translate(0, 0.22, 0);
const hourHand = put(hourGeo, std('#2d2846'), 0, 0, 0.08, clock);
const minHand = put(minGeo, std('#2d2846'), 0, 0, 0.09, clock);
hourHand.rotation.z = -1.2;
scene.add(clock);

// filing cabinet
{
  const cab = std('#86c2ab', { metalness: 0.1, roughness: 0.5 });
  put(new RoundedBoxGeometry(1.3, 2.4, 1.1, 2, 0.05), cab, -5.6, 1.2, -4.3);
  for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(0.4, 0.06, 0.06), std('#ffffff', { metalness: 0.6, roughness: 0.25 }), -5.6, 0.55 + k * 0.75, -3.72);
}

// the empty chair
const chair = new THREE.Group();
{
  const m = std('#7f8fd8', { roughness: 0.6 }), steel = std('#c4c7de', { metalness: 0.6, roughness: 0.3 });
  put(new RoundedBoxGeometry(1.5, 0.22, 1.4, 2, 0.08), m, 0, 1.05, 0, chair);
  put(new RoundedBoxGeometry(1.5, 1.5, 0.2, 2, 0.08), m, 0, 1.9, -0.66, chair);
  put(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 10), steel, 0, 0.55, 0, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = put(new THREE.BoxGeometry(0.9, 0.07, 0.12), steel, Math.cos(a) * 0.42, 0.16, Math.sin(a) * 0.42, chair);
    leg.rotation.y = -a;
    put(new THREE.SphereGeometry(0.09, 10, 8), std('#6d6a86'), Math.cos(a) * 0.85, 0.09, Math.sin(a) * 0.85, chair);
  }
}
scene.add(chair);

// desk, monitor, lamp, mug, sticky notes
const desk = new THREE.Group();
desk.position.set(3.3, 0, -1.7);
desk.rotation.y = -0.45;
const bulbMat = new THREE.MeshBasicMaterial({ color: '#eee', toneMapped: false });
{
  const wood = std('#d4a37f', { roughness: 0.55 });
  put(new RoundedBoxGeometry(3.6, 0.14, 1.6, 2, 0.04), wood, 0, 1.55, 0, desk);
  put(new THREE.BoxGeometry(0.12, 1.5, 1.4), wood, -1.65, 0.78, 0, desk);
  put(new THREE.BoxGeometry(0.12, 1.5, 1.4), wood, 1.65, 0.78, 0, desk);
  const dark = std('#4a4470', { roughness: 0.4 });
  put(new THREE.BoxGeometry(0.14, 0.5, 0.14), dark, 0, 1.85, -0.3, desk);
  put(new RoundedBoxGeometry(2.0, 1.25, 0.12, 2, 0.05), dark, 0, 2.62, -0.36, desk);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.08), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  scr.position.set(0, 2.62, -0.295);
  desk.add(scr);
  for (const [x, y, r, c] of [[-0.98, 3.05, 0.2, '#fff0a0'], [0.98, 3.1, -0.15, '#ffc8dd'], [0.96, 2.2, 0.1, '#c8f0dd']]) { const n = put(new THREE.PlaneGeometry(0.26, 0.26), std(c, { roughness: 0.9 }), x, y, -0.29, desk); n.rotation.z = r; }
  put(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 20), std('#ffffff', { roughness: 0.3 }), -1.2, 1.77, 0.35, desk);
  put(new THREE.CylinderGeometry(0.132, 0.125, 0.07, 20), std('#ff9fb8', { roughness: 0.4 }), -1.2, 1.8, 0.35, desk);
  const handle = put(new THREE.TorusGeometry(0.08, 0.02, 8, 16), std('#ffffff'), -1.07, 1.78, 0.35, desk);
  handle.rotation.y = Math.PI / 2;
  const base = std('#ff9fb8', { metalness: 0.2, roughness: 0.35 });
  put(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 20), base, 1.25, 1.65, 0.2, desk);
  const arm = put(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), base, 1.25, 2.05, 0.1, desk); arm.rotation.x = 0.35;
  const shade = put(new THREE.ConeGeometry(0.26, 0.34, 20, 1, true), std('#ffb8cb', { side: THREE.DoubleSide, metalness: 0.1 }), 1.15, 2.5, 0.35, desk);
  shade.rotation.set(0.9, 0, 0.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), bulbMat);
  bulb.position.set(1.12, 2.42, 0.42);
  desk.add(bulb);
}
scene.add(desk);
desk.updateMatrixWorld(true);
lampLight.position.copy(new THREE.Vector3(1.1, 2.3, 0.5).applyMatrix4(desk.matrixWorld));
screenLight.position.copy(new THREE.Vector3(0, 2.6, 0.4).applyMatrix4(desk.matrixWorld));
const MUG_TOP = new THREE.Vector3(-1.2, 1.95, 0.35).applyMatrix4(desk.matrixWorld);
const STACK = new THREE.Vector3(0.2, 1.63, 0.35).applyMatrix4(desk.matrixWorld);

// the plant that tells the truth
const plant = new THREE.Group();
plant.position.set(-3.1, 0, -2.6);
const leafMat = std('#5fb07a', { roughness: 0.6, side: THREE.DoubleSide });
const leaves = [];
{
  put(new THREE.CylinderGeometry(0.42, 0.32, 0.8, 20), std('#d9876c', { roughness: 0.8 }), 0, 0.4, 0, plant);
  put(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), std('#8a6a5a'), 0, 0.78, 0, plant);
  const leafGeo = new THREE.SphereGeometry(1, 12, 8).translate(0, 1, 0);
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.8;
    pivot.rotation.y = (i / 9) * Math.PI * 2;
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.scale.set(0.09, 0.62 + Math.random() * 0.3, 0.2);
    l.castShadow = true;
    pivot.add(l);
    pivot.userData.base = 0.25 + Math.random() * 0.25;
    plant.add(pivot);
    leaves.push(pivot);
  }
}
scene.add(plant);

// ================================================================ little things: a rug, fairy lights, flowers, a tree, a pumpkin
{
  const rug = put(new THREE.CylinderGeometry(2.3, 2.3, 0.03, 56), std('#e7a3ba', { roughness: 1 }), 0, 0.02, 0.2);
  rug.castShadow = false;
  put(new THREE.TorusGeometry(2.05, 0.06, 6, 56), std('#d9879f', { roughness: 1 }), 0, 0.04, 0.2).rotation.x = Math.PI / 2;
  put(new THREE.TorusGeometry(1.4, 0.05, 6, 48), std('#f3cfdb', { roughness: 1 }), 0, 0.04, 0.2).rotation.x = Math.PI / 2;
}
// fairy lights across the back wall
const fairy = [];
{
  const wire = [];
  const COLS = ['#ffd98a', '#ff9fb8', '#8ff0c4', '#b8c4ff', '#ffc49a'];
  for (let i = 0; i <= 28; i++) {
    const k = i / 28, x = -6.8 + k * 13.6, y = 7.55 - Math.sin(k * Math.PI * 3) ** 2 * 0.55;
    wire.push(new THREE.Vector3(x, y, -5.45));
    if (i % 1 === 0) {
      const m = new THREE.MeshBasicMaterial({ color: COLS[i % COLS.length], toneMapped: false });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m);
      b.position.set(x, y - 0.1, -5.4);
      scene.add(b);
      fairy.push({ m, base: new THREE.Color(COLS[i % COLS.length]), ph: Math.random() * 6 });
    }
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 120, 0.012, 4), std('#8a7fa8'));
  scene.add(tube);
}
// tulips and a cactus on the window sill
{
  const vase = put(new THREE.CylinderGeometry(0.16, 0.12, 0.42, 18), std('#b8c4ff', { roughness: 0.25 }), -2.4, 2.43, -5.25);
  vase.castShadow = true;
  const stem = std('#7fcf8f');
  [['#ff9fb8', -0.06, 0.1], ['#ffd98a', 0.07, -0.08], ['#ffffff', 0.0, 0.02], ['#c9b8ff', 0.1, 0.1]].forEach(([c, dx, tilt]) => {
    const s = put(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), stem, -2.4 + dx, 2.85, -5.25);
    s.rotation.z = tilt;
    const head = put(new THREE.SphereGeometry(0.075, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), std(c, { side: THREE.DoubleSide }), -2.4 + dx - tilt * 0.28, 3.12, -5.25);
    head.scale.y = 1.35;
  });
  put(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 14), std('#f4a68c'), -4.9, 2.31, -5.25);
  const cac = put(new THREE.CapsuleGeometry(0.08, 0.2, 4, 10), std('#8fd6a8'), -4.9, 2.55, -5.25);
  const arm = put(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), std('#8fd6a8'), -4.8, 2.58, -5.25); arm.rotation.z = -0.7;
  put(new THREE.SphereGeometry(0.035, 8, 6), std('#ff9fb8'), -4.9, 2.73, -5.25);
  cac.castShadow = arm.castShadow = true;
}
// a small indoor tree in the corner
{
  put(new THREE.CylinderGeometry(0.45, 0.35, 0.9, 20), std('#fffaf5', { roughness: 0.4 }), 5.7, 0.45, -4.2);
  put(new THREE.CylinderGeometry(0.43, 0.43, 0.04, 20), std('#8a6a5a'), 5.7, 0.9, -4.2);
  const trunk = put(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 8), std('#c9a58a'), 5.7, 1.95, -4.2);
  trunk.rotation.z = 0.05;
  const cols = ['#6fb487', '#5fa67c', '#82bf8c', '#6aae92'];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3, r = 0.35 + (i % 3) * 0.18;
    const b = put(new THREE.IcosahedronGeometry(0.42 + (i % 3) * 0.08, 1), std(cols[i % 4], { flatShading: true }), 5.7 + Math.cos(a) * r, 2.9 + (i % 4) * 0.28, -4.2 + Math.sin(a) * r * 0.7);
    b.rotation.set(i, i * 2, 0);
  }
}
// a pumpkin that is also, clearly, a lamp
const pumpkinFace = new THREE.MeshBasicMaterial({ color: '#ffd98a', toneMapped: false });
{
  const pk = new THREE.Group();
  pk.position.set(-2.2, 0, 1.4);
  const skin = std('#f0a06a', { roughness: 0.55 });
  for (let i = 0; i < 6; i++) { const seg = put(new THREE.SphereGeometry(0.34, 16, 12), skin, Math.cos((i / 6) * 6.28) * 0.13, 0.3, Math.sin((i / 6) * 6.28) * 0.13, pk); seg.scale.set(0.8, 0.85, 0.8); }
  put(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), std('#7fcf8f'), 0, 0.64, 0, pk);
  const eyeG = new THREE.CircleGeometry(0.06, 3);
  for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(eyeG, pumpkinFace); e.position.set(x, 0.36, 0.43); e.rotation.z = Math.PI / 2; pk.add(e); }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12, 0, Math.PI), pumpkinFace); mouth.position.set(0, 0.24, 0.43); mouth.rotation.z = Math.PI; pk.add(mouth);
  pk.rotation.y = 0.35;
  scene.add(pk);
}
// Employee of the Month (the easter egg)
const eomCanvas = document.createElement('canvas'); eomCanvas.width = 320; eomCanvas.height = 400;
const eomTex = new THREE.CanvasTexture(eomCanvas); eomTex.colorSpace = THREE.SRGBColorSpace;
function drawEom(img) {
  const g = eomCanvas.getContext('2d');
  const gold = g.createLinearGradient(0, 0, 320, 400); gold.addColorStop(0, '#b8862a'); gold.addColorStop(0.3, '#fff0b0'); gold.addColorStop(0.55, '#d9a93f'); gold.addColorStop(0.8, '#fbe39a'); gold.addColorStop(1, '#a8761d');
  g.fillStyle = gold; g.fillRect(0, 0, 320, 400);
  g.fillStyle = '#fffaf0'; g.fillRect(22, 22, 276, 356);
  g.fillStyle = '#3d2a07'; g.textAlign = 'center';
  g.font = '700 17px Georgia, serif'; g.fillText('EMPLOYEE OF THE MONTH', 160, 52);
  if (img) { g.save(); g.beginPath(); g.roundRect(52, 66, 216, 230, 10); g.clip(); const s = Math.max(216 / img.width, 230 / img.height); g.drawImage(img, 160 - (img.width * s) / 2, 66, img.width * s, img.height * s); g.restore(); }
  else { g.fillStyle = '#efe7d4'; g.fillRect(52, 66, 216, 230); }
  g.strokeStyle = '#d9a93f'; g.lineWidth = 3; g.strokeRect(52, 66, 216, 230);
  g.fillStyle = '#3d2a07'; g.font = 'italic 700 30px Georgia, serif'; g.fillText('Hitesh', 160, 342);
  eomTex.needsUpdate = true;
}
drawEom();
{ const im = new Image(); im.onload = () => drawEom(im); im.src = './hitesh.jpg'; }
const eom = new THREE.Group();
eom.position.set(0.55, 4.5, -5.5);
eom.rotation.z = 0.03;
{
  const f = new THREE.Mesh(new RoundedBoxGeometry(1.34, 1.66, 0.08, 2, 0.03), std('#e8c25a', { metalness: 0.7, roughness: 0.3 }));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshStandardMaterial({ map: eomTex, roughness: 0.5 }));
  pic.position.z = 0.045;
  f.castShadow = true;
  eom.add(f, pic);
}
scene.add(eom);

// ================================================================ the ghost
const profile = [];
for (let i = 0; i <= 14; i++) { const a = (i / 14) * (Math.PI / 2); profile.push(new THREE.Vector2(Math.sin(a) * 1.0 + 0.001, 0.6 + Math.cos(a) * 1.0)); }
profile.push(new THREE.Vector2(1.03, 0.1), new THREE.Vector2(1.08, -0.35), new THREE.Vector2(1.15, -0.75), new THREE.Vector2(1.2, -1.0));
const ghostMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uAmp: { value: 0.1 }, uColor: { value: new THREE.Color('#ffffff') }, uRim: { value: new THREE.Color('#8ff0c4') }, uOpacity: { value: 0.9 }, uRimAmt: { value: 0.5 }, uGlow: { value: 0.2 } },
  vertexShader: `uniform float uTime, uAmp; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec3 p = position; float f = clamp((0.2 - p.y) / 1.2, 0.0, 1.0); float th = atan(p.z, p.x);
      float w = sin(th * 7.0 + uTime * 3.2) * uAmp * f + sin(th * 3.0 - uTime * 2.0) * uAmp * 0.5 * f;
      p.xz *= 1.0 + w * 0.4; p.y += w;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vY = p.y;
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor, uRim; uniform float uOpacity, uRimAmt, uGlow; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec3 n = normalize(vN + vec3(0.0, 1e-5, 0.0)); vec3 v = normalize(vV + vec3(0.0, 0.0, 1e-5)); if (!gl_FrontFacing) n = -n;
      float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.2);
      float light = 0.4 + 0.6 * max(dot(n, normalize(vec3(0.3, 0.8, 0.6))), 0.0);
      vec3 col = uColor * light + uRim * fres * uRimAmt * 1.6 + uRim * uGlow * 0.35;
      float a = uOpacity * mix(1.0, 0.3 + 0.7 * fres, uRimAmt) * (0.55 + 0.45 * smoothstep(-1.1, -0.5, vY));
      a = clamp(a, 0.0, 1.0); if (!(a >= 0.0)) discard;
      gl_FragColor = vec4(clamp(col, 0.0, 4.0), a); }`,
});
const ghost = new THREE.Group();
ghost.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ghostMat));
const shadowCaster = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 20), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
shadowCaster.position.y = 0.3; shadowCaster.castShadow = true;
ghost.add(shadowCaster);
const faceMat = new THREE.MeshBasicMaterial({ color: '#2d2846', transparent: true });
const eyeGeo = new THREE.SphereGeometry(1, 16, 12);
const eyes = [-0.32, 0.32].map((x) => {
  const e = new THREE.Mesh(eyeGeo, faceMat); e.scale.set(0.12, 0.18, 0.05); e.position.set(x, 0.85, 0.93);
  const s = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: '#fff' })); s.scale.set(0.25, 0.18, 0.3); s.position.set(-0.3, 0.4, 0.8);
  e.add(s); ghost.add(e); return e;
});
const mouthO = new THREE.Mesh(eyeGeo, faceMat); mouthO.scale.set(0.12, 0.17, 0.04); mouthO.position.set(0, 0.42, 0.99); ghost.add(mouthO);
const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI), faceMat); smile.rotation.z = Math.PI; smile.position.set(0, 0.52, 0.98); smile.visible = false; ghost.add(smile);
const blush = [-0.55, 0.55].map((x) => { const b = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: '#ff9aa9', transparent: true, opacity: 0 })); b.scale.set(0.13, 0.07, 0.03); b.position.set(x, 0.6, 0.86); b.rotation.y = x * 0.6; ghost.add(b); return b; });
const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(eyeGeo, ghostMat); a.scale.set(0.32, 0.16, 0.18); a.position.set(s * 1.05, 0.15, 0.15); ghost.add(a); return a; });
const tie = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: '#ff9fb8', roughness: 0.5 });
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), m); knot.position.set(0, 0.2, 1.03);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 4), m); blade.rotation.set(Math.PI, Math.PI / 4, 0); blade.scale.z = 0.3; blade.position.set(0, -0.18, 1.07);
  tie.add(knot, blade); tie.visible = false; ghost.add(tie);
}
ghost.position.set(0, 2.9, 0.1);
scene.add(ghost);

// ectoplasm
const N = 420;
const pPos = new Float32Array(N * 3), pAlpha = new Float32Array(N), pSeed = Float32Array.from({ length: N }, () => Math.random());
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uPx: { value: 1 } },
  vertexShader: `uniform float uPx; attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * (50.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.62, 1.0, 0.82, a); }`,
});
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

// flying CVs
const cvMat = new THREE.MeshStandardMaterial({ map: cvTex, side: THREE.DoubleSide, roughness: 0.8 });
const cvGeo = new THREE.PlaneGeometry(0.5, 0.7);
const _q = new THREE.Quaternion();
const cvs = Array.from({ length: 14 }, (_, i) => {
  const m = new THREE.Mesh(cvGeo, cvMat);
  m.castShadow = false;
  m.userData = { seed: Math.random(), pos: new THREE.Vector3(), rot: new THREE.Euler() };
  m.position.copy(STACK).add(new THREE.Vector3(0, i * 0.014, 0));
  m.rotation.set(-Math.PI / 2, 0, -0.45);
  scene.add(m);
  return m;
});

// steam from the mug (only when the job is alive)
const STEAM = 30;
const steamPos = new Float32Array(STEAM * 3), steamSeed = Float32Array.from({ length: STEAM }, () => Math.random());
const steamGeo = new THREE.BufferGeometry();
steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0, depthWrite: false }));
steam.frustumCulled = false;
scene.add(steam);

// ================================================================ scene state machine
const S = { mode: 'idle', g: 0.45, gT: 0.45, alive: 0, aliveT: 0, busy: false };
const cAlive = new THREE.Color('#ffe2cf'), cGhost = new THREE.Color('#e6fff4'), cIdle = new THREE.Color('#f7f5ff'), DRY = new THREE.Color('#b8955e'), LEAF = new THREE.Color('#5fb07a');
let screenMsg = ['WE’RE', 'HIRING!!'], screenColor = '#ff9fb8', glitch = 0;

function setScene(score) {
  S.busy = false;
  S.gT = score / 100;
  S.aliveT = score < 25 ? 1 : 0;
  S.mode = score < 25 ? 'alive' : score < 50 ? 'faint' : score < 75 ? 'spooky' : 'polter';
  tie.visible = smile.visible = S.mode === 'alive';
  mouthO.visible = S.mode !== 'alive';
  [screenMsg, screenColor] = {
    alive: [['INTERVIEW', 'THURSDAY'], '#8ff0c4'], polter: [['HIRING', 'SINCE 2019'], '#ff9fb8'],
    spooky: [['TALENT', 'POOL'], '#ffd98a'], faint: [['WE’RE', 'HIRING?'], '#ffd98a'],
  }[S.mode];
  screenLight.color.set(screenColor);
}
function setBusy() { S.busy = true; screenMsg = ['LOADING', 'FEELINGS…']; screenColor = '#b8c4ff'; screenLight.color.set(screenColor); }
function resetScene() { S.mode = 'idle'; S.gT = 0.45; S.aliveT = 0; tie.visible = smile.visible = false; mouthO.visible = true; screenMsg = ['WE’RE', 'HIRING!!']; screenColor = '#ff9fb8'; screenLight.color.set(screenColor); }

function drawScreen(on) {
  const g = screenCanvas.getContext('2d');
  g.fillStyle = '#2a2548'; g.fillRect(0, 0, 512, 300);
  g.fillStyle = on ? screenColor : '#3d3760';
  g.font = '700 74px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  const jx = glitch > 0 ? (Math.random() - 0.5) * 30 : 0;
  screenMsg.forEach((l, i) => g.fillText(l, 256 + jx, 128 + i * 88));
  if (glitch > 0) { g.fillStyle = 'rgba(143,240,196,.35)'; g.fillRect(0, Math.random() * 300, 512, 6 + Math.random() * 20); }
  g.fillStyle = '#ffffff0c';
  for (let y = 0; y < 300; y += 4) g.fillRect(0, y, 512, 1);
  screenTex.needsUpdate = true;
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? 52 : w / h < 1.2 ? 44 : 36;
  camera.updateProjectionMatrix();
  fx.setSize(w, h);
  pMat.uniforms.uPx.value = renderer.getPixelRatio();
}
new ResizeObserver(resize).observe(stage);
resize();

const mouse = new THREE.Vector2();
addEventListener('pointermove', (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
// the framed photo on the wall is clickable
const ray = new THREE.Raycaster(), sNdc = new THREE.Vector2();
const overFrame = (e) => {
  const r = canvas.getBoundingClientRect();
  sNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(sNdc, camera);
  return ray.intersectObject(eom, true).length > 0;
};
canvas.addEventListener('pointermove', (e) => { const on = overFrame(e); canvas.style.cursor = on ? 'pointer' : ''; eomTarget = on ? 1 : 0; });
canvas.addEventListener('pointerleave', () => { eomTarget = 0; canvas.style.cursor = ''; });
canvas.addEventListener('click', (e) => { if (overFrame(e)) me.openCard(true); });
let eomTarget = 0;

const clk = new THREE.Clock();
const tmpV = new THREE.Vector3(), gPos = new THREE.Vector3(), lookAt = new THREE.Vector3();
let blinkT = 0, lastScreen = -1, lastSecret = false, eomHover = 0;
function frame() {
  const dt = Math.min(clk.getDelta(), 0.05), t = clk.elapsedTime;
  const k = 1 - Math.exp(-dt * 2.2);
  S.g = lerp(S.g, S.busy ? 0.6 + Math.sin(t * 9) * 0.25 : S.gT, k);
  S.alive = lerp(S.alive, S.busy ? 0 : S.aliveT, k);
  const g = S.g, polter = S.mode === 'polter' && !S.busy;

  if (S.busy) gPos.set(0, 3.3 + Math.sin(t * 3) * 0.2, 0.1);
  else if (S.mode === 'alive') gPos.set(0, 1.95, 0.08);
  else if (S.mode === 'spooky') gPos.set(Math.sin(t * 0.45) * 2.2, 3.1 + Math.sin(t * 1.2) * 0.3, Math.cos(t * 0.45) * 1.4 - 0.4);
  else if (polter) gPos.set(Math.sin(t * 1.3) * 3.2, 3.2 + Math.sin(t * 2.6) * 0.6, Math.sin(t * 2.6) * 1.6 - 0.3);
  else if (S.mode === 'faint') gPos.set(0.4 + Math.sin(t * 0.5) * 0.4, 3.0 + Math.sin(t * 1.3) * 0.16, 0.3);
  else gPos.set(0, 2.9 + Math.sin(t * 1.3) * 0.16, 0.1);
  ghost.position.lerp(gPos, 1 - Math.exp(-dt * (polter ? 6 : 2.5)));
  ghost.scale.setScalar(1 - S.alive * 0.18);
  ghost.rotation.y = S.busy ? t * 2.4 : polter ? Math.sin(t * 1.3) * 0.6 : lerp(ghost.rotation.y % (Math.PI * 2), mouse.x * 0.35, k);
  ghost.rotation.z = Math.sin(t * 0.9) * 0.04 + (polter ? Math.cos(t * 1.3) * 0.25 : 0);

  ghostMat.uniforms.uTime.value = t;
  ghostMat.uniforms.uAmp.value = 0.08 + g * 0.1 + (S.busy ? 0.08 : 0) - S.alive * 0.05;
  const flicker = polter ? 0.75 + Math.sin(t * 7) * 0.15 : 1;
  ghostMat.uniforms.uOpacity.value = (1 - g * 0.55) * flicker;
  ghostMat.uniforms.uRimAmt.value = 0.25 + g * 0.75 - S.alive * 0.25;
  ghostMat.uniforms.uGlow.value = g;
  ghostMat.uniforms.uColor.value.copy(cIdle).lerp(cGhost, g).lerp(cAlive, S.alive);
  ghostMat.depthWrite = S.alive > 0.6;
  faceMat.opacity = Math.min(1, 0.4 + (1 - g * 0.55));
  blush.forEach((b) => (b.material.opacity = S.alive * 0.6));
  ectoLight.position.copy(ghost.position).add(tmpV.set(0, 0.4, 1));
  ectoLight.intensity = g * 7;
  arms.forEach((a, i) => { a.position.y = 0.15 + Math.sin(t * (polter ? 8 : 2) + i * Math.PI) * (polter ? 0.25 : 0.06); });
  if (t > blinkT) blinkT = t + 2 + Math.random() * 4;
  eyes.forEach((e) => { e.scale.y = t > blinkT - 0.12 ? 0.02 : 0.18; e.position.x = Math.sign(e.position.x) * 0.32 + mouse.x * 0.05; e.position.y = 0.85 + mouse.y * 0.05; });

  // the room reacts
  chair.rotation.y = polter ? chair.rotation.y + dt * 1.1 : chair.rotation.y * 0.95;
  const clockSpeed = polter ? 9 : S.busy ? 3 : 0.02;
  minHand.rotation.z -= dt * clockSpeed; hourHand.rotation.z -= (dt * clockSpeed) / 12;
  const lampOn = S.alive > 0.5 ? 1 : S.mode === 'faint' ? 0.4 + Math.sin(t * 2.1) * 0.08 : 0;
  lampLight.intensity = lerp(lampLight.intensity, lampOn * 9, 0.06);
  bulbMat.color.set('#ffd9a0').multiplyScalar(0.12 + lampLight.intensity / 3);
  const health = Math.min(1, 1 - Math.min(1, g * 1.25) + S.alive * 0.4);
  leafMat.color.copy(DRY).lerp(LEAF, health);
  leaves.forEach((l, i) => { l.rotation.z = lerp(l.rotation.z, l.userData.base + (1 - health) * 1.25 + Math.sin(t * 1.5 + i) * 0.03, 0.05); });
  beamMat.uniforms.uTime.value = t;
  beamMat.uniforms.uAmt.value = 1 - S.alive * 0.4;
  glitch = polter && Math.random() < 0.015 ? 6 : Math.max(0, glitch - 1);
  fx.finish.uniforms.uAberration.value = polter ? 0.004 + (glitch ? 0.012 : 0) : S.busy ? 0.004 : 0;
  fx.finish.uniforms.uTint.value.setRGB(1 + S.alive * 0.04, 1, 1 + g * 0.05 - S.alive * 0.06);

  // CVs: a neat stack, a lazy drift, an orbit, or a tornado
  cvs.forEach((m, i) => {
    const u = m.userData, s = u.seed;
    if (!S.busy && (S.mode === 'alive' || S.mode === 'idle' || S.mode === 'faint')) {
      const floaty = S.mode === 'faint' && i > 9;
      u.pos.copy(STACK).add(tmpV.set((s - 0.5) * (S.mode === 'alive' ? 0.08 : 0.3), i * 0.014 + (floaty ? 1.2 + Math.sin(t + i) * 0.3 : 0), (s - 0.5) * 0.06));
      u.rot.set(-Math.PI / 2 + (floaty ? 1.2 : 0), floaty ? t * 0.4 : 0, -0.45 + (s - 0.5) * 0.3);
    } else {
      const speed = S.busy ? 2.4 : polter ? 1.8 : 0.6;
      const a = s * 20 + t * speed * (0.6 + s * 0.6);
      const r = 1.6 + s * 1.2 + (polter ? Math.sin(t * 2 + i) * 0.4 : 0);
      u.pos.set(ghost.position.x + Math.cos(a) * r, 0.7 + ((s * 7 + t * speed * 0.3) % 1) * 4, ghost.position.z + Math.sin(a) * r * 0.8);
      u.rot.set(t * (1 + s) + s * 6, t * 1.3 + s * 9, t * 0.7);
    }
    m.position.lerp(u.pos, 1 - Math.exp(-dt * 3));
    m.quaternion.slerp(_q.setFromEuler(u.rot), 1 - Math.exp(-dt * 4));
  });

  for (let i = 0; i < N; i++) {
    const s = pSeed[i], life = (t * (0.12 + s * 0.2) + s) % 1;
    const r = 1.1 + s * 1.5 + (S.busy ? Math.sin(t * 3 + s * 9) * 0.5 : 0);
    const a = s * 40 + t * (0.3 + s * 0.6) * (S.busy ? 4 : polter ? 2.5 : 1);
    pPos[i * 3] = ghost.position.x + Math.cos(a) * r;
    pPos[i * 3 + 1] = 0.3 + life * 5.4;
    pPos[i * 3 + 2] = ghost.position.z + Math.sin(a) * r * 0.7;
    pAlpha[i] = (i / N < g - S.alive * 0.4 ? 1 : 0) * Math.sin(Math.PI * life) * 0.55;
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.aAlpha.needsUpdate = true;

  for (let i = 0; i < DUST; i++) {
    const s = dustSeed[i], y = (s * 13 + t * 0.03 * (0.5 + s)) % 1;
    dustPos[i * 3] = -3.4 + y * 2.2 + Math.sin(t * 0.3 + s * 20) * 0.6 + (s - 0.5) * 1.4;
    dustPos[i * 3 + 1] = 5.8 - y * 5.5;
    dustPos[i * 3 + 2] = -5 + y * 6.5 + (s - 0.5) * 1.0;
  }
  dustGeo.attributes.position.needsUpdate = true;

  eomHover = lerp(eomHover, eomTarget, 0.15);
  steam.material.opacity = lerp(steam.material.opacity, S.alive * 0.5, 0.05);
  for (let i = 0; i < STEAM; i++) {
    const s = steamSeed[i], life = (t * 0.35 + s) % 1;
    steamPos[i * 3] = MUG_TOP.x + Math.sin(life * 6 + s * 10) * 0.06;
    steamPos[i * 3 + 1] = MUG_TOP.y + life * 0.7;
    steamPos[i * 3 + 2] = MUG_TOP.z + Math.cos(life * 5 + s * 10) * 0.05;
  }
  steamGeo.attributes.position.needsUpdate = true;

  for (const f of fairy) f.m.color.copy(f.base).multiplyScalar(1 + Math.max(0, Math.sin(t * 1.4 + f.ph)) * 0.6);
  pumpkinFace.color.set('#ffd98a').multiplyScalar(1.2 + Math.sin(t * 2.5) * 0.1);
  eom.rotation.z = 0.03 + (polter ? Math.sin(t * 9) * 0.06 : 0) + eomHover * Math.sin(t * 6) * 0.02;
  eom.scale.setScalar(1 + eomHover * 0.04);

  // every so often, while nobody's looking, the monitor tells the truth
  const idle = S.mode === 'idle' && !S.busy;
  const secret = idle && t % 22 > 19.5;
  if (secret !== lastSecret) { lastSecret = secret; screenMsg = secret ? ['✦ HELLO', 'THERE ✦'] : idle ? ['WE’RE', 'HIRING!!'] : screenMsg; screenColor = secret ? '#ffd98a' : idle ? '#ff9fb8' : screenColor; lastScreen = -1; }
  const tick = Math.floor(t * (glitch ? 12 : 1));
  if (tick !== lastScreen) { lastScreen = tick; drawScreen(S.mode === 'alive' || S.mode === 'idle' || secret || tick % 3 !== 2 || glitch > 0); }

  // camera: mouse parallax, a dolly toward the chair when it's alive, a shiver for poltergeists
  const shake = polter ? 0.03 : S.busy ? 0.015 : 0;
  camera.position.set(
    CAM.x + mouse.x * 0.6 - S.alive * 0.6 + (Math.random() - 0.5) * shake,
    CAM.y + mouse.y * 0.3 - S.alive * 0.5 + (Math.random() - 0.5) * shake,
    CAM.z - S.alive * 2.2,
  );
  camera.lookAt(lookAt.copy(LOOK).lerp(SEAT, S.alive * 0.6));

  fx.render(dt, t);
  requestAnimationFrame(frame);
}
frame();

// ================================================================ EMF meter
const LED_N = 12;
const LED_COL = ['#ff9f8a', '#ffab8a', '#ffc08a', '#ffd48a', '#ffe08a', '#e8e38a', '#c9b8ff', '#b3a4ff', '#a292f5', '#8ff0c4', '#72e3b0', '#5fd6a0'];
$('leds').innerHTML = Array.from({ length: LED_N }, (_, i) => `<i style="height:${40 + i * 5}%"></i>`).join('');
const ledEls = [...$('leds').children];
const emf = { v: 0, target: null };
let emfNum = 0;
function emfLoop() {
  const t = performance.now() / 1000;
  let level;
  if (S.busy) level = (Math.sin(t * 5) * 0.5 + 0.5) * 0.9;
  else if (emf.target == null) level = 0.16 + Math.sin(t * 1.3) * 0.03;
  else { emf.v += (emf.target - emf.v) * 0.08; if (Math.abs(emf.target - emf.v) < 0.004) emf.v = emf.target; level = emf.v; }
  const lit = Math.round(level * LED_N);
  ledEls.forEach((el, i) => { const on = i < lit; el.style.background = on ? LED_COL[i] : '#2d284614'; el.style.boxShadow = on ? `0 0 12px ${LED_COL[i]}aa` : 'none'; });
  if (S.busy && (emfNum = (emfNum + 1) % 8) === 0) $('emfVal').textContent = String(Math.floor(level * 99)).padStart(2, '0');
  else if (!S.busy) $('emfVal').textContent = emf.target == null ? '--' : Math.round(level * 100);
  $('emfVal').style.color = emf.target == null || S.busy ? '' : LED_COL[Math.max(0, lit - 1)];
  requestAnimationFrame(emfLoop);
}
emfLoop();

// ================================================================ UI
const ICON = {
  ghost: '<svg class="i" viewBox="0 0 24 24"><path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.6L14.3 21 12 19.4 9.7 21l-2.4-1.6z"/></svg>',
  heart: '<svg class="i" viewBox="0 0 24 24"><path d="M3 12h4l2-4 3 8 2-4h7"/></svg>',
  candle: '<svg class="i" viewBox="0 0 24 24"><path d="M12 2c1.5 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .5-2 2-4zM9 10h6v12H9z"/></svg>',
  arrow: '<svg class="i" viewBox="0 0 24 24" style="margin-top:2px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};
const AGES = [['This week', 4], ['2–4 weeks', 21], ['1–2 months', 45], ['2+ months', 80], ['No idea', null]];
let ageDays = null;
$('age').innerHTML = AGES.map(([l], i) => `<button data-i="${i}" aria-pressed="${i === 4}">${l}</button>`).join('');
$('age').querySelectorAll('button').forEach((b) => (b.onclick = () => { ageDays = AGES[+b.dataset.i][1]; $('age').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
const setAge = (days) => { const i = AGES.findIndex((a) => a[1] === days); $('age').querySelectorAll('button')[i >= 0 ? i : 4].click(); };

const SAMPLES = {
  ghost: `Urgent Hiring!! Software Engineer – Multiple Locations

Our client, a leading MNC, is always looking for passionate rockstar developers to join our talent pool for future opportunities. We are a fast-paced, dynamic environment where we work hard, play hard and are like a family.

Requirements:
- Fresher or 0-2 years of experience
- Must have 6+ years of hands-on experience in Java, Python, React, Angular, Node, Go, Rust, AWS, Azure, GCP, Docker, Kubernetes, Kafka, Spark, Hadoop, SQL, MongoDB, Redis and Terraform
- Self-starter who can hit the ground running and wear many hats
- Excellent communication skills

Interested candidates can share their updated CV at careers.hiring.2021@gmail.com. Only immediate joiners preferred.`,
  alive: `Backend Engineer (SDE-1) — Payments, Nimbus Labs (Bengaluru, hybrid)
Job ID: NL-ENG-20431
Salary: ₹16–22 LPA + ESOPs

You'll join our Payments team of 6 and report to Priya, Engineering Manager, Payments.

What you will do
In your first 90 days you will build the refund reconciliation service in Go and PostgreSQL, taking it from design doc to production. After that you will own it: on-call for one service, one week in six.

Responsibilities
- Design and ship REST APIs used by our merchant dashboard
- Write tests, review code, and improve our observability
- Work closely with the risk and support teams on failure cases

What we're looking for
- 1–3 years building backend services in any language
- Comfortable with SQL and reading query plans

Interview process
One 90-minute take-home (paid), two technical rounds, and a hiring manager chat. We reply within 5 working days of each step.

Application deadline: 30 October. Target start date: December.`,
};

const ta = $('jd');
const updateCount = () => ($('count').textContent = `${ta.value.length.toLocaleString()} characters`);
ta.addEventListener('input', updateCount);
$('sGhost').onclick = () => { ta.value = SAMPLES.ghost; setAge(80); $('repost').checked = true; updateCount(); };
$('sAlive').onclick = () => { ta.value = SAMPLES.alive; setAge(4); $('repost').checked = false; updateCount(); };
$('paste').onclick = async () => { try { ta.value = await navigator.clipboard.readText(); updateCount(); ta.focus(); } catch { toast('Your browser blocked paste. Use ⌘V in the box.'); ta.focus(); } };
$('clear').onclick = () => { ta.value = ''; updateCount(); ta.focus(); };
ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) bust(); });
$('go').onclick = bust;
$('againBtn').onclick = () => {
  $('results').classList.remove('show'); ta.value = ''; updateCount();
  $('panel').scrollTo({ top: 0, behavior: 'smooth' }); ta.focus();
  $('tierHud').classList.remove('show'); emf.target = null; resetScene();
};
$('howBtn').onclick = () => $('how').classList.add('open');
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.remove('open')));
$('how').addEventListener('click', (e) => { if (e.target.id === 'how') e.target.classList.remove('open'); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('how').classList.remove('open'); });
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === b.dataset.p));
}));

initTurnstile('ts').catch(() => {});

const IC = (d) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const me = initMe({
  id: 'boo-lean', name: 'Boo-lean', music: 'spooky', mount: $('stageTools'), btnClass: 'st-btn', introDelay: 700,
  intro: {
    kicker: 'Paranormal job investigations',
    titleHtml: 'Boo<span>·</span>lean',
    lede: 'Some job posts are <b>ghosts</b>: nobody is hiring, they just collect CVs. Paste one in and we’ll investigate whether anyone is actually home.',
    steps: [
      [IC('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'), 'Paste the job post', 'The whole thing. Or try one of the two samples.'],
      [IC('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), 'Say how old it is', 'Stale, reposted jobs are the usual suspects.'],
      [IC('<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.6L14.3 21 12 19.4 9.7 21l-2.4-1.6z"/>'), 'Watch the office react', 'Real job: the ghost puts on a tie. Ghost job: poltergeist.'],
    ],
    cta: 'Open the case file',
    note: 'Your text is never stored',
  },
});

const SEANCE = ['Lighting the candles…', 'Reading between the bullet points…', 'Asking HR. No reply.', 'Checking if the seat is warm…', 'Counting the buzzwords…', 'Consulting the talent pool…'];
let seanceT;
function seance(on) {
  $('seance').classList.toggle('show', on);
  clearInterval(seanceT);
  if (on) { let i = 0; $('seanceTxt').textContent = SEANCE[0]; seanceT = setInterval(() => ($('seanceTxt').textContent = SEANCE[++i % SEANCE.length]), 900); }
}

let last = null;
async function bust() {
  const jd = ta.value.trim();
  $('err').textContent = '';
  if (jd.length < 150) {
    $('err').textContent = 'Paste the whole job description (at least a few sentences). Ghosts hide in the details.';
    const box = ta.closest('.box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    return;
  }
  const days = ageDays, reposted = $('repost').checked;
  const local = scan(jd, { days, reposted });

  $('go').disabled = true;
  $('go').querySelector('span').textContent = 'Investigating…';
  setBusy(); seance(true);
  emf.target = null;
  $('tierHud').classList.remove('show');
  const minWait = new Promise((r) => setTimeout(r, 2200));

  let res = null, note = null;
  try {
    const token = await getToken();
    const r = await fetch('/api/haunt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jd, days, reposted, turnstile: token }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) res = d; else note = d.error || `The medium is unavailable (${r.status}).`;
  } catch { note = 'Couldn’t reach the medium. Showing the instruments only.'; }
  if (!res) res = { score: local.score, tier: tierOf(local.score), heur: local, ai: null, note };
  await minWait;

  seance(false);
  $('go').disabled = false;
  $('go').querySelector('span').textContent = 'Investigate';
  render(jd, res);
}

const TIER_COLOR = { alive: '#23A094', faint: '#e0a100', spooky: '#E0457B', poltergeist: '#9b3fd6' };
function render(jd, r) {
  last = r;
  setScene(r.score);
  emf.target = r.score / 100;
  const tier = r.tier || tierOf(r.score), col = TIER_COLOR[tier.key];
  $('tierTxt').textContent = `${tier.name} · ${r.score}/100`;
  $('tierDot').style.background = col; $('tierDot').style.boxShadow = `0 0 10px ${col}`;
  $('tierHud').classList.add('show');

  const caseNo = String((Math.abs([...jd].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 9000) + 1000);
  $('caseNo').textContent = `Case file No. ${caseNo}`;
  $('caseTitle').textContent = jd.split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 80) || 'Untitled posting';
  const stamp = $('stamp');
  stamp.textContent = tier.name; stamp.style.color = col;
  stamp.style.animation = 'none'; void stamp.offsetWidth; stamp.style.animation = '';
  countUp($('rScore'), r.score); $('rScore').style.color = col;
  $('rLine').textContent = tier.line;
  const gSum = r.heur.ghost.reduce((a, x) => a + x.w, 0), lSum = r.heur.life.reduce((a, x) => a + x.w, 0);
  $('gSum').textContent = `+${gSum}`; $('lSum').textContent = lSum ? `−${Math.abs(lSum)}` : '0';

  $('rAi').innerHTML = r.ai
    ? `<div class="medium"><div class="h">${ICON.candle} The medium says</div><div class="v">“${esc(r.ai.verdict || tier.name)}”</div><p>${esc(r.ai.reading || '')}</p>${r.ai.advice ? `<div class="advice">${ICON.arrow}<span>${esc(r.ai.advice)}</span></div>` : ''}<div class="note">Score = 55% the medium + 45% the instruments.</div></div>`
    : `<div class="note">${esc(r.note || 'The medium is off tonight, so this reading comes from the instruments alone.')}</div>`;

  const gl = r.heur.ghost.map((f) => ({ ic: ICON.ghost, h: f.label, w: f.why, q: f.hits[0]?.text, pts: `+${f.w}`, cls: '' }))
    .concat((r.ai?.flags || []).map((f) => ({ ic: ICON.candle, h: 'The medium noticed', w: f.why, q: f.quote, pts: '', cls: 'ai' })));
  const ll = r.heur.life.map((f) => ({ ic: ICON.heart, h: f.label, w: f.why, q: f.hits[0]?.text, pts: `${f.w}`, cls: 'life' }))
    .concat((r.ai?.life || []).map((f) => ({ ic: ICON.heart, h: 'The medium felt a pulse', w: f.why, q: f.quote, pts: '', cls: 'life' })));
  const item = (x) => `<div class="e ${x.cls}"><div class="ic">${x.ic}</div><div><div class="h">${esc(x.h)}</div><div class="w">${esc(x.w)}</div>${x.q ? `<q>${esc(x.q)}</q>` : ''}</div><div class="pts">${x.pts}</div></div>`;
  $('pGhost').innerHTML = gl.length ? gl.map(item).join('') : '<div class="empty">Nothing spooky. Suspiciously clean.</div>';
  $('pLife').innerHTML = ll.length ? ll.map(item).join('') : '<div class="empty">No pulse detected.</div>';
  $('nGhost').textContent = gl.length; $('nLife').textContent = ll.length;

  const marks = [];
  for (const f of r.heur.ghost) for (const h of f.hits) marks.push({ i: h.i, n: h.n, cls: '', why: f.label });
  for (const f of r.heur.life) for (const h of f.hits) marks.push({ i: h.i, n: h.n, cls: 'life', why: f.label });
  const lower = jd.toLowerCase();
  for (const [list, cls] of [[r.ai?.flags || [], ''], [r.ai?.life || [], 'life']]) for (const f of list) {
    const i = lower.indexOf(String(f.quote).toLowerCase());
    if (i >= 0) marks.push({ i, n: f.quote.length, cls, why: f.why });
  }
  marks.sort((a, b) => a.i - b.i || b.n - a.n);
  let html = '', at = 0;
  for (const m of marks) { if (m.i < at) continue; html += esc(jd.slice(at, m.i)) + `<mark class="${m.cls}" title="${esc(m.why)}">${esc(jd.slice(m.i, m.i + m.n))}</mark>`; at = m.i + m.n; }
  $('rJd').innerHTML = html + esc(jd.slice(at));
  document.querySelector('.tabs button').click();

  const res = $('results');
  res.classList.remove('show'); void res.offsetWidth; res.classList.add('show');
  setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
}

function countUp(el, to) {
  const start = performance.now();
  const step = (now) => { const k = Math.min(1, (now - start) / 1100); el.textContent = Math.round(to * ease(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ================================================================ share: a case-file image
$('shareBtn').onclick = async () => {
  if (!last) return;
  const tier = last.tier || tierOf(last.score), col = TIER_COLOR[tier.key];
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  await Promise.all(['700 80px "Space Grotesk"', '700 60px "IBM Plex Mono"', '600 30px "Space Grotesk"'].map((f) => document.fonts.load(f).catch(() => {})));
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#F4F4F0'); bg.addColorStop(1, '#F4F4F0');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(143,127,232,.09)'; for (let y = 0; y < H; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  fx.render(0.016, clk.elapsedTime); // draw a fresh frame so the WebGL canvas can be copied this tick
  const shot = renderer.domElement, sw = shot.width, sh = shot.height, s = Math.max((W - 120) / sw, 560 / sh);
  g.save(); g.beginPath(); g.roundRect(60, 60, W - 120, 560, 36); g.clip();
  g.drawImage(shot, (W - sw * s) / 2, 60 + (560 - sh * s) / 2, sw * s, sh * s);
  g.restore();
  g.fillStyle = '#827c9e'; g.font = '600 26px "IBM Plex Mono"'; g.fillText($('caseNo').textContent.toUpperCase(), 80, 690);
  g.fillStyle = '#2d2846'; g.font = '700 76px "Space Grotesk"'; g.fillText(tier.name, 80, 780);
  g.font = '700 150px "IBM Plex Mono"'; g.fillStyle = col;
  const sc = String(last.score); g.fillText(sc, 80, 950);
  const sx = 80 + g.measureText(sc).width + 16;
  g.fillStyle = '#827c9e'; g.font = '600 36px "IBM Plex Mono"'; g.fillText('/ 100 ghost', sx, 950);
  g.fillStyle = '#4a4566'; g.font = '600 32px "Space Grotesk"';
  const top = last.heur.ghost.slice(0, 4).map((f) => `•  ${f.label}`);
  (top.length ? top : ['•  Nothing spooky. Suspiciously clean.']).forEach((l, i) => g.fillText(l, 80, 1040 + i * 50));
  g.fillStyle = '#000'; g.font = '700 54px "Space Grotesk"'; g.fillText('Boo·lean', 80, H - 80);
  g.fillStyle = '#827c9e'; g.font = '600 26px "Space Grotesk"'; g.textAlign = 'right'; g.fillText(`is this job real? · ${location.host}`, W - 80, H - 90);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `boo-lean-case-${last.score}.png`, { type: 'image/png' });
  const text = `A job post I found scored ${last.score}/100 on the Boo·lean ghost meter: “${last.ai?.verdict || tier.name}”. ${tier.line}`;
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url: location.origin }); return; } } catch { return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  try { await navigator.clipboard.writeText(`${text} ${location.origin}`); } catch {}
  toast('Case file downloaded, caption copied.');
};
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }
