// @ts-check
/**
 * components/shader-source.js — Le shader d'une couche Shader : le source GLSL complet qu'on compile à partir du code que l'auteur écrit, les
 * uniformes que ses réglages déclarés deviennent, et la lecture du journal du compilateur. Pur : ni DOM ni WebGL.
 *
 * L'auteur écrit `void mainImage(out vec4 fragColor, in vec2 fragCoord)` comme sur Shadertoy : un code copié de là marche presque tel quel
 * (`iResolution`, `iTime` et `iMouse` existent). `fragCoord` est en pixels de la **source de référence** (le repère de toute la plateforme), origine
 * en bas à gauche, de 0 à `uResolution` : la composition ne dépend ni de la résolution d'OBS ni de la qualité de rendu choisie. La couleur rendue est
 * **non prémultipliée** (le source d'enveloppe la prémultiplie, comme le canvas l'attend).
 *
 * Le code de l'auteur est précédé de `#line 1` : les lignes du journal du compilateur sont celles de son texte, sans conversion.
 *
 * @typedef {import('./code-params.js').ParamDefinition} ParamDefinition
 * @typedef {import('./code-params.js').ParamValues} ParamValues
 * @typedef {{ message: string, line: number | null, column: number | null }} ShaderReport
 * @typedef {{ name: string, type: 'float' | 'vec3', key: string, definition: ParamDefinition }} UniformDeclaration
 */

/** Sommet : un grand triangle qui couvre l'écran, sans tampon (`gl_VertexID`). */
export const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Valeur de `uAlert` tant qu'aucune alerte n'est arrivée : assez grande pour que `exp(-uAlert)` soit nul. */
export const NO_ALERT = 1e6;

const RESERVED_UNDERSCORES = /__/;

/** @param {string} key */
export const uniformName = (key) => `u_${key}`;

/**
 * Les réglages déclarés que le shader reçoit en uniformes, et ceux qu'il ne reçoit pas avec la raison : un nombre, une case et une liste (son rang) sont un `float`,
 * une couleur un `vec3`, un texte n'a pas de forme en GLSL.
 * @param {readonly ParamDefinition[]} params
 * @returns {{ uniforms: UniformDeclaration[], problems: string[] }}
 */
export function uniformPlan(params) {
  /** @type {UniformDeclaration[]} */
  const uniforms = [];
  /** @type {string[]} */
  const problems = [];
  for (const definition of params) {
    if (definition.type === 'text') continue;
    const name = uniformName(definition.key);
    if (RESERVED_UNDERSCORES.test(name)) {
      problems.push(`réglage « ${definition.key} » : deux _ de suite sont réservés en GLSL, il n'est pas transmis au shader`);
      continue;
    }
    uniforms.push({ name, type: definition.type === 'color' ? 'vec3' : 'float', key: definition.key, definition });
  }
  return { uniforms, problems };
}

/**
 * Le source du fragment : en-tête (version, uniformes, alias Shadertoy), code de l'auteur à partir de la ligne 1, enveloppe.
 * @param {string} code
 * @param {readonly UniformDeclaration[]} uniforms
 * @returns {{ source: string, authorLines: number }}
 */
export function composeFragment(code, uniforms) {
  const header = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'uniform vec4 uAudio;',
    'uniform float uAlert;',
    'uniform float uPixelScale;',
    ...uniforms.map(({ name, type }) => `uniform ${type} ${name};`),
    '#define iResolution vec3(uResolution, 1.0)',
    '#define iTime uTime',
    '#define iMouse vec4(0.0)',
    'out vec4 outColor;',
    '#line 1',
  ].join('\n');
  const footer = [
    'void main() {',
    '  vec4 shaded = vec4(0.0);',
    '  mainImage(shaded, gl_FragCoord.xy * uPixelScale);',
    '  float alpha = clamp(shaded.a, 0.0, 1.0);',
    '  outColor = vec4(clamp(shaded.rgb, 0.0, 1.0) * alpha, alpha);',
    '}',
  ].join('\n');
  return { source: `${header}\n${code}\n${footer}\n`, authorLines: code.split('\n').length };
}

/**
 * Le journal du compilateur (ANGLE : `ERROR: 0:<ligne>: '<jeton>' : <message>`) en comptes rendus pour l'auteur. Une ligne au-delà de la dernière du
 * texte de l'auteur vient de l'enveloppe : le plus souvent `mainImage` manque ou n'a pas la bonne signature.
 * @param {string} log
 * @param {number} authorLines
 * @returns {ShaderReport[]}
 */
export function parseCompileLog(log, authorLines) {
  /** @type {ShaderReport[]} */
  const reports = [];
  for (const raw of log.split('\n')) {
    const text = raw.trim();
    if (text === '') continue;
    const match = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(text);
    if (match === null) {
      if (/^(?:ERROR|WARNING)/.test(text)) reports.push({ message: text.slice(0, 300), line: null, column: null });
      continue;
    }
    if (/^WARNING/.test(text)) continue;
    const line = Number(match[1]);
    const message = match[2].slice(0, 300);
    if (line >= 1 && line <= authorLines) reports.push({ message, line, column: null });
    else reports.push({ message: `${message} — le shader doit définir void mainImage(out vec4 fragColor, in vec2 fragCoord)`, line: null, column: null });
  }
  return reports.length > 0 ? reports : [{ message: log.trim().slice(0, 300) || 'compilation refusée', line: null, column: null }];
}

/**
 * Les trois composantes (0 à 1) d'une couleur `#rgb` ou `#rrggbb` ; noir pour tout autre texte.
 * @param {unknown} text
 * @returns {[number, number, number]}
 */
export function parseColor(text) {
  const match = typeof text === 'string' ? /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text.trim()) : null;
  if (match === null) return [0, 0, 0];
  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  const [red, green, blue] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  return [red, green, blue];
}

/**
 * La valeur d'uniforme d'un réglage : un nombre, 1 ou 0 pour une case, le rang du choix pour une liste, trois composantes pour une couleur.
 * @param {UniformDeclaration} declaration
 * @param {ParamValues} values
 * @returns {number | [number, number, number]}
 */
export function uniformValue({ definition, type }, values) {
  const value = values[definition.key];
  if (type === 'vec3') return parseColor(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (definition.type === 'select') return Math.max(0, (definition.choices ?? []).indexOf(String(value)));
  return 0;
}
