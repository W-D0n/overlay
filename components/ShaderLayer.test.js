import { describe, expect, test } from 'bun:test';
import { kindDefaults } from './kind-options.js';
import { COMPILE_DELAY_MS, MAX_SURFACE, ShaderLayer, normalizeShaderOptions } from './ShaderLayer.js';
import { NO_ALERT } from './shader-source.js';

const SPEC = JSON.stringify([
  { key: 'vitesse', label: 'Vitesse', type: 'number', default: 1, min: 0, max: 4 },
  { key: 'teinte', label: 'Teinte', type: 'color', default: '#ff8000' },
  { key: 'actif', label: 'Actif', type: 'boolean', default: true },
]);
const GOOD = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }';
const options = (extra = {}) => ({ ...kindDefaults('shader'), glsl: GOOD, paramSpec: SPEC, params: {}, ...extra });

/** Un contexte WebGL qui note tout ce qu'on lui demande et refuse les sources qu'on lui désigne. */
function fakeGl({ refuse = (source) => source.includes('REFUSE'), link = true } = {}) {
  const log = [];
  const uniforms = [];
  let counter = 0;
  const gl = {
    VERTEX_SHADER: 'vs', FRAGMENT_SHADER: 'fs', COMPILE_STATUS: 'cs', LINK_STATUS: 'ls', TRIANGLES: 'tri',
    createShader(type) { counter += 1; return { id: counter, type }; },
    shaderSource(shader, source) { shader.source = source; },
    compileShader(shader) { shader.ok = shader.type === 'vs' || !refuse(shader.source); },
    getShaderParameter: (shader) => shader.ok,
    getShaderInfoLog: () => "ERROR: 0:2: 'nope' : undeclared identifier\n",
    deleteShader(shader) { log.push(`deleteShader:${shader.id}`); },
    createProgram() { counter += 1; return { id: counter }; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => link,
    getProgramInfoLog: () => 'ERROR: link failed\n',
    deleteProgram(program) { log.push(`deleteProgram:${program.id}`); },
    getUniformLocation: (program, name) => ({ program: program.id, name }),
    useProgram(program) { log.push(`use:${program.id}`); },
    viewport(...args) { log.push(`viewport:${args.join(',')}`); },
    uniform1f(location, a) { uniforms.push([location?.name, a]); },
    uniform2f(location, a, b) { uniforms.push([location?.name, a, b]); },
    uniform3f(location, a, b, c) { uniforms.push([location?.name, a, b, c]); },
    uniform4f(location, a, b, c, d) { uniforms.push([location?.name, a, b, c, d]); },
    drawArrays(mode, first, count) { log.push(`draw:${mode}:${first}:${count}`); },
    getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext() { log.push('lose'); } } : null),
  };
  return { gl, log, uniforms };
}

function setup({ width = 960, height = 540, sceneHeight = 540, gl = fakeGl(), webgl2 = true } = {}) {
  const listeners = {};
  const canvas = {
    style: {}, offsetWidth: width, offsetHeight: height, width: 0, height: 0,
    getContext: () => (webgl2 ? gl.gl : null),
    addEventListener: (type, listener) => { listeners[type] = listener; },
    removeEventListener: (type) => { delete listeners[type]; },
  };
  const frames = new Set();
  const clock = { subscribe: (listener) => { frames.add(listener); return () => frames.delete(listener); }, pixelRatio: () => 1 };
  let time = 0;
  const frame = (dt) => { time += dt; for (const listener of [...frames]) listener({ dt, time, pixelRatio: 1 }); };
  class FakeObserver { observe() {} disconnect() { FakeObserver.disconnected = true; } }
  const timers = [];
  let now = 0;
  const environment = {
    documentRef: { createElement: () => canvas },
    clock,
    ResizeObserverImpl: FakeObserver,
    sceneHeight: () => sceneHeight,
    setTimer: (callback, delay) => { const timer = { callback, at: now + delay }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const at = timers.indexOf(timer); if (at >= 0) timers.splice(at, 1); },
  };
  const advance = (ms) => { now += ms; for (const timer of timers.filter((entry) => entry.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.callback(); } };
  const lastUniform = (name) => gl.uniforms.filter(([uniform]) => uniform === name).at(-1);
  return { environment, canvas, gl, frame, advance, frames, listeners, lastUniform, timers, FakeObserver };
}

const draws = (t) => t.gl.log.filter((entry) => entry.startsWith('draw:')).length;

describe('ShaderLayer — compilation', () => {
  test('le code est compilé à la création, sans attendre une image', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    expect(layer.reports?.current()).toEqual([]);
    t.frame(0.016);
    expect(draws(t)).toBe(1);
  });

  test('une erreur à la première compilation : rien n’est dessiné, l’erreur est dite avec sa ligne', () => {
    const t = setup();
    const layer = ShaderLayer(options({ glsl: `${GOOD}\n// REFUSE` }), t.environment);
    t.frame(0.016);
    expect(draws(t)).toBe(0);
    expect(layer.reports?.current()).toEqual([{ message: "'nope' : undeclared identifier", line: 2, column: null }]);
  });

  test('une erreur après un programme valide : le dernier programme valide continue de tourner', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    layer.update?.(options({ glsl: `${GOOD}\n// REFUSE` }));
    t.advance(COMPILE_DELAY_MS);
    expect(layer.reports?.current()).toHaveLength(1);
    t.frame(0.016);
    expect(draws(t)).toBe(2);
    expect(t.gl.log.filter((entry) => entry.startsWith('deleteProgram'))).toEqual([]);
  });

  test('une compilation réussie remplace le programme, libère l’ancien et efface les erreurs', () => {
    const t = setup();
    const layer = ShaderLayer(options({ glsl: `${GOOD}\n// REFUSE` }), t.environment);
    expect(layer.reports?.current()).toHaveLength(1);
    layer.update?.(options({ glsl: GOOD }));
    t.advance(COMPILE_DELAY_MS);
    expect(layer.reports?.current()).toEqual([]);
    layer.update?.(options({ glsl: `${GOOD}\n// ok` }));
    t.advance(COMPILE_DELAY_MS);
    expect(t.gl.log.filter((entry) => entry.startsWith('deleteProgram'))).toHaveLength(1);
  });

  test('plusieurs frappes rapprochées ne compilent qu’une fois, après la pause', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    let count = 0;
    const original = t.gl.gl.createShader;
    t.gl.gl.createShader = (type) => { if (type === 'fs') count += 1; return original(type); };
    layer.update?.(options({ glsl: `${GOOD}\n// a` }));
    t.advance(COMPILE_DELAY_MS - 10);
    layer.update?.(options({ glsl: `${GOOD}\n// ab` }));
    t.advance(COMPILE_DELAY_MS - 10);
    expect(count).toBe(0);
    t.advance(20);
    expect(count).toBe(1);
  });

  test('un réglage modifié ne recompile pas', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    let count = 0;
    const original = t.gl.gl.createShader;
    t.gl.gl.createShader = (type) => { count += 1; return original(type); };
    layer.update?.(options({ params: { vitesse: 3 } }));
    t.advance(COMPILE_DELAY_MS * 2);
    expect(count).toBe(0);
  });

  test('une déclaration modifiée recompile : les uniformes en dépendent', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('u_neuf')).toBeUndefined();
    layer.update?.(options({ paramSpec: JSON.stringify([{ key: 'neuf', type: 'number', default: 7 }]) }));
    t.advance(COMPILE_DELAY_MS);
    t.frame(0.016);
    expect(t.lastUniform('u_neuf')).toEqual(['u_neuf', 7]);
  });

  test('un échec d’édition de liens est remonté', () => {
    const t = setup({ gl: fakeGl({ link: false }) });
    const layer = ShaderLayer(options(), t.environment);
    expect(layer.reports?.current()[0].message).toContain('link failed');
  });

  test('un réglage à clé interdite en GLSL est signalé, sans empêcher le shader de tourner', () => {
    const t = setup();
    const layer = ShaderLayer(options({ paramSpec: JSON.stringify([{ key: 'a__b', type: 'number', default: 1 }]) }), t.environment);
    t.frame(0.016);
    expect(draws(t)).toBe(1);
    expect(layer.reports?.current()[0].message).toContain('a__b');
  });
});

describe('ShaderLayer — uniformes', () => {
  test('la résolution est celle de la source de référence, quelle que soit la taille réelle de la zone', () => {
    const t = setup({ width: 960, height: 540, sceneHeight: 540 });
    ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('uResolution')).toEqual(['uResolution', 1920, 1080]);
    expect(t.canvas.width).toBe(960);
    expect(t.canvas.height).toBe(540);
    expect(t.lastUniform('uPixelScale')).toEqual(['uPixelScale', 2]);
  });

  test('le temps part de zéro à la première image puis s’accumule', () => {
    const t = setup();
    ShaderLayer(options(), t.environment);
    t.frame(5);
    expect(t.lastUniform('uTime')[1]).toBe(0);
    t.frame(0.5);
    t.frame(0.25);
    expect(t.lastUniform('uTime')[1]).toBeCloseTo(0.75, 10);
  });

  test('uAlert vaut « jamais » avant une alerte, puis compte les secondes depuis elle', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('uAlert')[1]).toBe(NO_ALERT);
    t.frame(1);
    layer.trigger?.({ type: 'raid' });
    t.frame(0.4);
    expect(t.lastUniform('uAlert')[1]).toBeCloseTo(0.4, 10);
  });

  test('le niveau sonore reçu arrive dans uAudio, silence par défaut', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('uAudio')).toEqual(['uAudio', 0, 0, 0, 0]);
    layer.setAudioLevel?.({ level: 0.5, bass: 0.25, mid: 0.125, treble: 0.0625 });
    t.frame(0.016);
    expect(t.lastUniform('uAudio')).toEqual(['uAudio', 0.5, 0.25, 0.125, 0.0625]);
  });

  test('chaque réglage est un uniforme : nombre, couleur en trois composantes, case en 1 ou 0', () => {
    const t = setup();
    const layer = ShaderLayer(options({ params: { vitesse: 2.5, teinte: '#00ff00', actif: false } }), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')).toEqual(['u_vitesse', 2.5]);
    expect(t.lastUniform('u_teinte')).toEqual(['u_teinte', 0, 1, 0]);
    expect(t.lastUniform('u_actif')).toEqual(['u_actif', 0]);
    layer.update?.(options({ params: { vitesse: 3, teinte: '#00ff00', actif: false } }));
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')).toEqual(['u_vitesse', 3]);
  });

  test('une valeur imposée par la timeline passe avant la valeur réglée, bornée par la déclaration ; {} la rend', () => {
    const t = setup();
    const layer = ShaderLayer(options({ params: { vitesse: 2 } }), t.environment);
    layer.drive?.({ vitesse: 3 });
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')[1]).toBe(3);
    layer.drive?.({ vitesse: 99 });
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')[1]).toBe(4);
    layer.drive?.({ vitesse: Number.NaN });
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')[1]).toBe(2);
    layer.drive?.({ vitesse: 1 });
    layer.drive?.({});
    t.frame(0.016);
    expect(t.lastUniform('u_vitesse')[1]).toBe(2);
  });
});

describe('ShaderLayer — taille et qualité', () => {
  test('la moitié et le quart calculent moins de pixels, et uPixelScale le compense', () => {
    const t = setup();
    const layer = ShaderLayer(options({ quality: 'half' }), t.environment);
    t.frame(0.016);
    expect([t.canvas.width, t.canvas.height]).toEqual([480, 270]);
    expect(t.lastUniform('uPixelScale')[1]).toBe(4);
    layer.update?.(options({ quality: 'quarter' }));
    t.frame(0.016);
    expect([t.canvas.width, t.canvas.height]).toEqual([240, 135]);
    layer.update?.(options({ quality: 'full' }));
    t.frame(0.016);
    expect([t.canvas.width, t.canvas.height]).toEqual([960, 540]);
  });

  test('la résolution vue par le shader ne dépend pas de la qualité', () => {
    const t = setup();
    ShaderLayer(options({ quality: 'quarter' }), t.environment);
    t.frame(0.016);
    expect(t.lastUniform('uResolution')).toEqual(['uResolution', 1920, 1080]);
  });

  test('le canvas ne dépasse jamais la taille maximale', () => {
    const t = setup({ width: 9000, height: 6000, sceneHeight: 6000 });
    ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.canvas.width).toBe(MAX_SURFACE);
    expect(t.canvas.height).toBe(MAX_SURFACE);
  });

  test('une zone sans taille ne dessine pas', () => {
    const t = setup({ width: 0, height: 0 });
    ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(draws(t)).toBe(0);
  });

  test('la zone est entièrement couverte : un triangle, la fenêtre aux dimensions du canvas', () => {
    const t = setup();
    ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.gl.log).toContain('viewport:0,0,960,540');
    expect(t.gl.log).toContain('draw:tri:0:3');
  });
});

describe('ShaderLayer — contexte graphique', () => {
  test('un contexte perdu arrête le dessin et le dit ; restauré, le shader reprend', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    let prevented = false;
    t.listeners.webglcontextlost({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    expect(layer.reports?.current()[0].message).toContain('contexte graphique');
    t.frame(0.016);
    expect(draws(t)).toBe(1);
    t.listeners.webglcontextrestored();
    expect(layer.reports?.current()).toEqual([]);
    t.frame(0.016);
    expect(draws(t)).toBe(2);
  });

  test('sans WebGL2 la couche ne casse rien et le dit', () => {
    const t = setup({ webgl2: false });
    const layer = ShaderLayer(options(), t.environment);
    expect(layer.reports?.current()[0].message).toContain('WebGL2');
    expect(() => { layer.update?.(options()); layer.destroy?.(); }).not.toThrow();
    expect(t.frames.size).toBe(0);
  });

  test('détruire libère le programme, rend le contexte et se désabonne de l’horloge', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    t.frame(0.016);
    expect(t.frames.size).toBe(1);
    layer.destroy?.();
    expect(t.frames.size).toBe(0);
    expect(t.gl.log.some((entry) => entry.startsWith('deleteProgram'))).toBe(true);
    expect(t.gl.log).toContain('lose');
    t.frame(0.016);
    expect(draws(t)).toBe(1);
  });

  test('détruire annule une compilation en attente', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    layer.update?.(options({ glsl: `${GOOD}\n// x` }));
    expect(t.timers).toHaveLength(1);
    layer.destroy?.();
    expect(t.timers).toHaveLength(0);
  });
});

describe('ShaderLayer — comptes rendus au Studio', () => {
  test('les abonnés sont prévenus à chaque compilation et peuvent se désabonner', () => {
    const t = setup();
    const layer = ShaderLayer(options(), t.environment);
    const seen = [];
    const stop = layer.reports?.subscribe((reports) => seen.push(reports.length));
    layer.update?.(options({ glsl: `${GOOD}\n// REFUSE` }));
    t.advance(COMPILE_DELAY_MS);
    layer.update?.(options({ glsl: GOOD }));
    t.advance(COMPILE_DELAY_MS);
    expect(seen).toEqual([1, 0]);
    stop?.();
    layer.update?.(options({ glsl: `${GOOD}\n// REFUSE` }));
    t.advance(COMPILE_DELAY_MS);
    expect(seen).toEqual([1, 0]);
  });
});

describe('normalizeShaderOptions', () => {
  test('les défauts, la déclaration lue et les valeurs qui en découlent', () => {
    const normalized = normalizeShaderOptions({});
    expect(normalized.glsl).toContain('void mainImage');
    expect(normalized.quality).toBe('full');
    expect(normalized.params.map(({ key }) => key)).toEqual(['couleur', 'vitesse', 'echelle']);
    expect(normalized.values).toEqual({ couleur: '#C8B97A', vitesse: 1, echelle: 6 });
  });

  test('une qualité inconnue revient au plein', () => {
    expect(normalizeShaderOptions({ quality: 'ultra' }).quality).toBe('full');
  });

  test('le shader par défaut compile sans erreur de forme : il définit mainImage et lit ses réglages', () => {
    const { glsl, params } = normalizeShaderOptions({});
    expect(glsl).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
    for (const { key } of params) expect(glsl).toContain(`u_${key}`);
  });
});
