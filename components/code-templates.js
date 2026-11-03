// @ts-check

/**
 * components/code-templates.js — Starting points for a Code layer: a complete HTML + CSS + JavaScript + settings declaration each, that the Studio puts in the layer in one step
 * ("Modèle de départ"). Data only. The sources are stored as plain text, so they hold no template literal (nothing to escape), and the JavaScript needs no import: a template runs
 * as it is, in the isolated page, with the `overlay` object. The unit test checks that each one is a valid Code layer: sizes, settings declaration, syntax of the script.
 *
 * @typedef {{ id: string, label: string, description: string, html: string, css: string, js: string, paramSpec: string }} CodeTemplate
 */

/** @type {readonly CodeTemplate[]} */
export const CODE_TEMPLATES = Object.freeze([
  {
    id: 'titre-revele',
    label: 'Titre qui se révèle',
    description: 'Un titre révélé de gauche à droite, un filet qui se trace dessous ; une alerte raid le passe en blanc. HTML et CSS seulement.',
    html: '<div class="titre"><span>Bonjour</span><i></i></div>',
    css: String.raw`.titre {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15em;
  font: 700 calc(var(--param-taille) * 1px) / 1 Georgia, serif;
  color: var(--param-couleur);
}
.titre span {
  display: block;
  clip-path: inset(0 100% 0 0);
  animation: revele calc(var(--param-duree) * 1s) cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
.titre i {
  display: block;
  width: 0;
  height: 0.04em;
  background: var(--param-couleur);
  animation: filet calc(var(--param-duree) * 1s) calc(var(--param-duree) * 0.4s) ease-out forwards;
}
.alert-raid .titre span { color: #fff; }
@keyframes revele { to { clip-path: inset(0 0 0 0); } }
@keyframes filet { to { width: 60%; } }
`,
    js: '// Ce titre n’a pas besoin de JavaScript : tout est dans le HTML et le CSS.\n',
    paramSpec: String.raw`[
  { "key": "couleur", "label": "Couleur", "type": "color", "default": "#C8B97A" },
  { "key": "taille", "label": "Taille (px)", "type": "number", "default": 140, "min": 20, "max": 400, "step": 1 },
  { "key": "duree", "label": "Durée de l'arrivée (s)", "type": "number", "default": 1.6, "min": 0.3, "max": 10, "step": 0.1 }
]`,
  },
  {
    id: 'particules',
    label: 'Particules (canvas 2D)',
    description: 'Des particules qui montent. Leur nombre, leur vitesse et leur couleur sont des réglages ; avec « Réagit au son », elles gonflent avec le niveau sonore.',
    html: '<canvas id="c"></canvas>',
    css: String.raw`canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
`,
    js: String.raw`// Des particules sur un canvas : leur nombre, leur vitesse et leur couleur viennent des réglages.
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let particles = [];

function fit() {
  canvas.width = Math.round(overlay.size.width * overlay.pixelRatio);
  canvas.height = Math.round(overlay.size.height * overlay.pixelRatio);
}

function seed() {
  particles = Array.from({ length: overlay.params.nombre }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 1 + Math.random() * 3,
    v: 0.2 + Math.random() * 0.8,
  }));
}

fit();
seed();
overlay.on('resize', fit);
overlay.on('params', () => {
  if (particles.length !== overlay.params.nombre) seed();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = overlay.params.couleur;
  const swell = 1 + overlay.levels.level * 2;
  for (const p of particles) {
    p.y -= p.v * overlay.params.vitesse * dt * 0.1;
    if (p.y < -0.02) {
      p.y = 1.02;
      p.x = Math.random();
    }
    ctx.globalAlpha = 0.25 + p.v * 0.6;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, p.r * swell * overlay.pixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`,
    paramSpec: String.raw`[
  { "key": "couleur", "label": "Couleur", "type": "color", "default": "#C8B97A" },
  { "key": "nombre", "label": "Nombre de particules", "type": "number", "default": 80, "min": 5, "max": 400, "step": 1 },
  { "key": "vitesse", "label": "Vitesse", "type": "number", "default": 1, "min": 0.1, "max": 5, "step": 0.1 }
]`,
  },
  {
    id: 'cube-webgl',
    label: 'Cube 3D (WebGL)',
    description: 'Un cube qui tourne, dessiné en WebGL sans bibliothèque. Sa couleur, sa vitesse et sa taille sont des réglages ; les graves le font palpiter avec « Réagit au son ».',
    html: '<canvas id="c"></canvas>',
    css: String.raw`canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
`,
    js: String.raw`// Un cube en WebGL sans bibliothèque. Pour three.js, déposez le fichier dans la médiathèque et écrivez : import * as THREE from 'asset:<identifiant>';
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
if (!gl) throw new Error('WebGL indisponible dans cette source navigateur');

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, [
  'attribute vec3 position;',
  'attribute vec3 normal;',
  'uniform mat4 matrix;',
  'uniform mat4 rotation;',
  'varying float light;',
  'void main() {',
  '  vec3 n = normalize((rotation * vec4(normal, 0.0)).xyz);',
  '  light = 0.35 + 0.65 * max(0.0, dot(n, normalize(vec3(0.4, 0.7, 0.6))));',
  '  gl_Position = matrix * vec4(position, 1.0);',
  '}',
].join('\n')));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, [
  'precision mediump float;',
  'uniform vec3 color;',
  'varying float light;',
  'void main() { gl_FragColor = vec4(color * light, 1.0); }',
].join('\n')));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const positions = [];
const normals = [];
const indices = [];
for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
  const u = cross(n, Math.abs(n[2]) === 1 ? [0, 1, 0] : [0, 0, 1]);
  const v = cross(n, u);
  const base = positions.length / 3;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let i = 0; i < 3; i += 1) positions.push(n[i] + u[i] * a + v[i] * b);
    normals.push(...n);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function buffer(target, data, Type) {
  gl.bindBuffer(target, gl.createBuffer());
  gl.bufferData(target, new Type(data), gl.STATIC_DRAW);
}
function attribute(name, data) {
  buffer(gl.ARRAY_BUFFER, data, Float32Array);
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
}
attribute('position', positions);
attribute('normal', normals);
buffer(gl.ELEMENT_ARRAY_BUFFER, indices, Uint16Array);

const mul = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const rotY = (t) => { const c = Math.cos(t); const s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const rotX = (t) => { const c = Math.cos(t); const s = Math.sin(t); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const scale = (k) => [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1];
const shift = (z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function fit() {
  canvas.width = Math.round(overlay.size.width * overlay.pixelRatio);
  canvas.height = Math.round(overlay.size.height * overlay.pixelRatio);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
fit();
overlay.on('resize', fit);
gl.enable(gl.DEPTH_TEST);

const uniform = (name) => gl.getUniformLocation(program, name);
let angle = 0;
let last = performance.now();
function frame(now) {
  angle += Math.min(0.1, (now - last) / 1000) * overlay.params.vitesse;
  last = now;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const size = overlay.params.taille * (1 + overlay.levels.bass * 0.35);
  const rotation = mul(rotY(angle), rotX(angle * 0.6));
  const model = mul(rotation, scale(size));
  const view = mul(perspective(0.7, canvas.width / canvas.height, 0.1, 20), shift(-6));
  gl.uniformMatrix4fv(uniform('matrix'), false, mul(view, model));
  gl.uniformMatrix4fv(uniform('rotation'), false, rotation);
  gl.uniform3fv(uniform('color'), rgb(overlay.params.couleur));
  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`,
    paramSpec: String.raw`[
  { "key": "couleur", "label": "Couleur", "type": "color", "default": "#C8B97A" },
  { "key": "vitesse", "label": "Vitesse de rotation", "type": "number", "default": 0.8, "min": 0, "max": 6, "step": 0.1 },
  { "key": "taille", "label": "Taille du cube", "type": "number", "default": 1, "min": 0.3, "max": 1.6, "step": 0.05 }
]`,
  },
].map((template) => Object.freeze(template)));
