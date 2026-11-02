// @ts-check
import { getRenderClock } from '../render-clock.js';
import { referenceScale } from '../render-reference.js';
import { normalizeKindOptions } from './kind-options.js';
import { normalizeParamValues, parseParamSpec } from './code-params.js';
import { NO_ALERT, VERTEX_SOURCE, composeFragment, parseCompileLog, uniformPlan, uniformValue } from './shader-source.js';

/**
 * components/ShaderLayer.js — Couche de contenu « shader » : un fragment GLSL (WebGL2) que l'auteur écrit comme sur Shadertoy, calculé par la carte
 * graphique sur toute la zone de la couche. Là où une couche Code ouvre une page entière, un shader est le moyen léger d'obtenir des fonds génératifs
 * (plasma, fluides, grilles, champs de bruit) : un seul triangle, un programme, quelques uniformes.
 *
 * GLSL n'a ni réseau, ni stockage, ni accès à la page : le shader tourne dans la page de rendu sans bac à sable. Son seul danger est le **coût** (une
 * boucle sans fin fait réinitialiser le pilote graphique) : la qualité de rendu (plein, moitié, quart) le borne, et un lot importé qui en contient le dit
 * avant d'être confirmé (`dev/bundle-assets.js`).
 *
 * Le shader est calculé dans le repère de la **source de référence** (`uResolution` en pixels de référence, comme le texte) quelle que soit la résolution
 * d'OBS et la qualité. Un changement de code ou de déclaration est compilé après une courte pause ; **si la compilation échoue, le dernier programme valide
 * continue de tourner** et les erreurs, avec leur ligne, sont remontées au Studio (`reports`) : taper n'éteint pas l'antenne. Les réglages numériques
 * peuvent être animés (`drive`), comme ceux d'une couche Code.
 *
 * Chaque couche tient un contexte WebGL (le navigateur en garde une quinzaine) : `destroy` le rend aussitôt.
 *
 * @typedef {{
 *   documentRef?: Document,
 *   clock?: Pick<ReturnType<typeof import('../render-clock.js').createRenderClock>, 'subscribe' | 'pixelRatio'>,
 *   ResizeObserverImpl?: typeof ResizeObserver,
 *   sceneHeight?: () => number,
 *   setTimer?: (callback: () => void, delayMs: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 *   compileDelayMs?: number,
 * }} ShaderLayerEnvironment
 * @typedef {import('./shader-source.js').ShaderReport} ShaderReport
 * @typedef {import('./shader-source.js').UniformDeclaration} UniformDeclaration
 * @typedef {{ program: WebGLProgram, locations: Map<string, WebGLUniformLocation | null>, declarations: UniformDeclaration[] }} CompiledProgram
 */

/** Pause entre la dernière modification du code et sa compilation. */
export const COMPILE_DELAY_MS = 250;
/** Plus grand côté du canvas de rendu, en pixels : au-delà, la carte graphique n'apporte rien à une source de diffusion. */
export const MAX_SURFACE = 4096;
/** Comptes rendus gardés pour le Studio. */
const MAX_KEPT_REPORTS = 20;
/** Part des pixels de la source que chaque qualité calcule. */
export const QUALITY_SCALE = Object.freeze({ full: 1, half: 0.5, quarter: 0.25 });

const BUILTINS = ['uResolution', 'uTime', 'uAudio', 'uAlert', 'uPixelScale'];

/**
 * Les options complètes d'une couche Shader, la déclaration des réglages lue et les valeurs qui en découlent.
 * @param {unknown} raw
 */
export function normalizeShaderOptions(raw) {
  const options = normalizeKindOptions('shader', raw);
  const paramSpec = /** @type {string} */ (options.paramSpec);
  const spec = parseParamSpec(paramSpec);
  const quality = /** @type {keyof typeof QUALITY_SCALE} */ (options.quality);
  return { glsl: /** @type {string} */ (options.glsl), paramSpec, quality, params: spec.params, specErrors: spec.errors, values: normalizeParamValues(spec.params, options.params) };
}

/**
 * @param {unknown} rawOptions
 * @param {ShaderLayerEnvironment} [environment]
 * @returns {import('../types.js').ComponentInstance}
 */
export function ShaderLayer(rawOptions, environment = {}) {
  const documentRef = environment.documentRef ?? document;
  const clock = environment.clock ?? getRenderClock();
  const ResizeObserverImpl = environment.ResizeObserverImpl ?? ResizeObserver;
  const setTimer = environment.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = environment.clearTimer ?? ((handle) => clearTimeout(/** @type {*} */ (handle)));
  const compileDelayMs = environment.compileDelayMs ?? COMPILE_DELAY_MS;

  let options = normalizeShaderOptions(rawOptions);

  const canvas = documentRef.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const gl = /** @type {WebGL2RenderingContext | null} */ (canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }));

  /** @type {ShaderReport[]} */
  let reports = [];
  /** @type {Set<(reports: readonly ShaderReport[]) => void>} */
  const subscribers = new Set();
  function notify() {
    for (const listener of [...subscribers]) listener(reports);
  }
  /** @param {ShaderReport[]} next */
  function setReports(next) {
    reports = next.slice(-MAX_KEPT_REPORTS);
    notify();
  }

  /** @type {import('../types.js').ComponentInstance['reports']} */
  const reportsApi = {
    current: () => reports,
    subscribe(listener) {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
  };

  if (gl === null) {
    setReports([{ message: 'WebGL2 n’est pas disponible dans ce navigateur : le shader ne peut pas être affiché.', line: null, column: null }]);
    return { el: canvas, reports: reportsApi, update(next) { options = normalizeShaderOptions(next); }, destroy() {} };
  }
  const context = gl;

  /** @type {WebGLShader | null} */
  let vertex = null;
  /** @type {CompiledProgram | null} */
  let current = null;
  let lost = false;
  let destroyed = false;
  /** @type {unknown} */
  let compileTimer = null;
  let elapsed = 0;
  let firstFrame = true;
  /** @type {number | null} */
  let alertAt = null;
  let levels = { level: 0, bass: 0, mid: 0, treble: 0 };
  /** Les valeurs de réglages imposées par la timeline ou une liaison (`drive`). @type {Record<string, number>} */
  let driven = {};

  let size = { width: 0, height: 0 };
  let surface = { width: 0, height: 0 };
  let ratio = 0;

  /** @returns {import('./code-params.js').ParamValues} */
  function currentValues() {
    return Object.keys(driven).length === 0 ? options.values : normalizeParamValues(options.params, { ...options.values, ...driven });
  }

  /** @param {number} type @param {string} source @returns {{ shader: WebGLShader } | { log: string }} */
  function compileShader(type, source) {
    const shader = /** @type {WebGLShader} */ (context.createShader(type));
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (context.getShaderParameter(shader, context.COMPILE_STATUS)) return { shader };
    const log = context.getShaderInfoLog(shader) ?? '';
    context.deleteShader(shader);
    return { log };
  }

  /** Compile le code courant. Succès : il remplace le programme en cours ; échec : le programme en cours continue et les erreurs sont remontées. */
  function build() {
    if (destroyed || lost) return;
    const plan = uniformPlan(options.params);
    const problems = plan.problems.map((message) => ({ message, line: null, column: null }));
    if (vertex === null) {
      const compiled = compileShader(context.VERTEX_SHADER, VERTEX_SOURCE);
      if (!('shader' in compiled)) {
        setReports([{ message: `sommet du moteur refusé : ${compiled.log.trim()}`, line: null, column: null }]);
        return;
      }
      vertex = compiled.shader;
    }
    const { source, authorLines } = composeFragment(options.glsl, plan.uniforms);
    const fragment = compileShader(context.FRAGMENT_SHADER, source);
    if (!('shader' in fragment)) {
      setReports([...parseCompileLog(fragment.log, authorLines), ...problems]);
      return;
    }
    const program = /** @type {WebGLProgram} */ (context.createProgram());
    context.attachShader(program, vertex);
    context.attachShader(program, fragment.shader);
    context.linkProgram(program);
    context.deleteShader(fragment.shader);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const log = context.getProgramInfoLog(program) ?? '';
      context.deleteProgram(program);
      setReports([...parseCompileLog(log, authorLines), ...problems]);
      return;
    }
    if (current !== null) context.deleteProgram(current.program);
    /** @type {Map<string, WebGLUniformLocation | null>} */
    const locations = new Map();
    for (const name of [...BUILTINS, ...plan.uniforms.map(({ name: uniform }) => uniform)]) locations.set(name, context.getUniformLocation(program, name));
    current = { program, locations, declarations: plan.uniforms };
    setReports(problems);
  }

  function scheduleBuild() {
    if (compileTimer !== null) clearTimer(compileTimer);
    compileTimer = setTimer(() => { compileTimer = null; build(); }, compileDelayMs);
  }

  /**
   * Ajuste le canvas à sa zone ; ne recalcule que si la taille, le ratio ou la qualité a changé.
   * @param {number} pixelRatio
   * @returns {boolean} faux tant que la zone n'a pas de taille
   */
  function fit(pixelRatio) {
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width === 0 || height === 0) return false;
    if (width === surface.width && height === surface.height && pixelRatio === ratio) return true;
    surface = { width, height };
    ratio = pixelRatio;
    const scene = environment.sceneHeight?.();
    const scale = referenceScale(scene !== undefined && scene > 0 ? scene : height);
    size = { width: width / scale, height: height / scale };
    const factor = QUALITY_SCALE[options.quality];
    canvas.width = Math.max(1, Math.min(MAX_SURFACE, Math.round(width * pixelRatio * factor)));
    canvas.height = Math.max(1, Math.min(MAX_SURFACE, Math.round(height * pixelRatio * factor)));
    return true;
  }

  /** @param {import('../render-clock.js').RenderFrame} frame */
  function draw(frame) {
    if (!fit(frame.pixelRatio) || current === null) return;
    elapsed += firstFrame ? 0 : frame.dt;
    firstFrame = false;
    const { program, locations, declarations } = current;
    context.viewport(0, 0, canvas.width, canvas.height);
    context.useProgram(program);
    context.uniform2f(locations.get('uResolution') ?? null, size.width, size.height);
    context.uniform1f(locations.get('uTime') ?? null, elapsed);
    context.uniform4f(locations.get('uAudio') ?? null, levels.level, levels.bass, levels.mid, levels.treble);
    context.uniform1f(locations.get('uAlert') ?? null, alertAt === null ? NO_ALERT : elapsed - alertAt);
    context.uniform1f(locations.get('uPixelScale') ?? null, size.width / canvas.width);
    const values = currentValues();
    for (const declaration of declarations) {
      const location = locations.get(declaration.name) ?? null;
      const value = uniformValue(declaration, values);
      if (typeof value === 'number') context.uniform1f(location, value);
      else context.uniform3f(location, value[0], value[1], value[2]);
    }
    context.drawArrays(context.TRIANGLES, 0, 3);
  }

  const observer = new ResizeObserverImpl(() => { fit(clock.pixelRatio()); });
  observer.observe(canvas);
  const stop = clock.subscribe(draw);

  /** @param {Event} event */
  function onLost(event) {
    event.preventDefault();
    lost = true;
    current = null;
    vertex = null;
    setReports([{ message: 'Le contexte graphique a été perdu (carte graphique réinitialisée) : le shader reprend dès qu’il est rendu.', line: null, column: null }]);
  }
  function onRestored() {
    lost = false;
    build();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  build();

  return {
    el: canvas,
    cost: () => null,
    reports: reportsApi,

    /** @param {unknown} next */
    update(next) {
      const merged = normalizeShaderOptions(next);
      const codeChanged = merged.glsl !== options.glsl || merged.paramSpec !== options.paramSpec;
      const qualityChanged = merged.quality !== options.quality;
      options = merged;
      if (qualityChanged) { surface = { width: 0, height: 0 }; }
      if (codeChanged) scheduleBuild();
    },

    /** @param {Readonly<Record<string, number>>} values */
    drive(values) {
      driven = Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
    },

    /** @param {import('../audio-levels.js').AudioLevels} next */
    setAudioLevel(next) {
      levels = { level: next.level, bass: next.bass, mid: next.mid, treble: next.treble };
    },

    /** Une alerte : `uAlert` repart de zéro. */
    trigger() {
      alertAt = elapsed;
    },

    destroy() {
      destroyed = true;
      stop();
      observer.disconnect();
      if (compileTimer !== null) clearTimer(compileTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (current !== null) context.deleteProgram(current.program);
      if (vertex !== null) context.deleteShader(vertex);
      current = null;
      vertex = null;
      // Le navigateur ne garde qu'une quinzaine de contextes : celui-ci est rendu sans attendre le ramasse-miettes.
      context.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
