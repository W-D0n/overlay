import { describe, expect, test } from 'bun:test';
import { parseParamSpec } from './code-params.js';
import { composeFragment, parseColor, parseCompileLog, uniformName, uniformPlan, uniformValue } from './shader-source.js';

const params = (...definitions) => parseParamSpec(JSON.stringify(definitions)).params;

describe('uniformPlan : ce que le shader reçoit de ses réglages', () => {
  test('un nombre, une case et une liste sont un float, une couleur un vec3, un texte n’est pas transmis', () => {
    const { uniforms, problems } = uniformPlan(params(
      { key: 'vitesse', type: 'number', default: 1 },
      { key: 'actif', type: 'boolean', default: true },
      { key: 'mode', type: 'select', choices: ['a', 'b'], default: 'a' },
      { key: 'teinte', type: 'color', default: '#ff0000' },
      { key: 'titre', type: 'text', default: 'x' },
    ));
    expect(uniforms.map(({ name, type }) => `${type} ${name}`)).toEqual(['float u_vitesse', 'float u_actif', 'float u_mode', 'vec3 u_teinte']);
    expect(problems).toEqual([]);
    expect(uniformName('taille')).toBe('u_taille');
  });

  test('une clé à deux soulignés de suite est écartée avec la raison : GLSL les réserve', () => {
    const { uniforms, problems } = uniformPlan(params({ key: 'a__b', type: 'number', default: 1 }, { key: 'ok', type: 'number', default: 1 }));
    expect(uniforms.map(({ name }) => name)).toEqual(['u_ok']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a__b');
    expect(problems[0]).toContain('deux _ de suite');
  });
});

describe('valeurs d’uniformes', () => {
  const declare = (...definitions) => uniformPlan(params(...definitions)).uniforms;
  test('nombre tel quel, case en 1 ou 0, liste en rang du choix, couleur en trois composantes', () => {
    const [number, flag, mode, color] = declare(
      { key: 'n', type: 'number', default: 2.5 },
      { key: 'f', type: 'boolean', default: true },
      { key: 'm', type: 'select', choices: ['a', 'b', 'c'], default: 'a' },
      { key: 'c', type: 'color', default: '#000000' },
    );
    expect(uniformValue(number, { n: 2.5 })).toBe(2.5);
    expect(uniformValue(flag, { f: true })).toBe(1);
    expect(uniformValue(flag, { f: false })).toBe(0);
    expect(uniformValue(mode, { m: 'c' })).toBe(2);
    expect(uniformValue(mode, { m: 'inconnu' })).toBe(0);
    expect(uniformValue(color, { c: '#ff8000' })).toEqual([1, 128 / 255, 0]);
  });

  test('une valeur absente vaut zéro', () => {
    const [number] = declare({ key: 'n', type: 'number', default: 2.5 });
    expect(uniformValue(number, {})).toBe(0);
  });

  test('les couleurs : #rgb et #rrggbb, noir pour tout le reste', () => {
    expect(parseColor('#f00')).toEqual([1, 0, 0]);
    expect(parseColor('#FF0000')).toEqual([1, 0, 0]);
    for (const bad of ['rouge', '#ff', '#ggg000', 'rgb(1,2,3)', '', null, 42]) expect(parseColor(bad)).toEqual([0, 0, 0]);
  });
});

describe('composeFragment', () => {
  const { uniforms } = uniformPlan(params({ key: 'vitesse', type: 'number', default: 1 }, { key: 'teinte', type: 'color', default: '#fff' }));
  const code = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.0);\n}';
  const { source, authorLines } = composeFragment(code, uniforms);
  const lines = source.split('\n');

  test('la version est la première ligne (la directive doit précéder tout le reste)', () => {
    expect(lines[0]).toBe('#version 300 es');
  });

  test('les uniformes communs et ceux des réglages sont déclarés avant le code', () => {
    const before = source.slice(0, source.indexOf(code));
    for (const declaration of ['uniform vec2 uResolution;', 'uniform float uTime;', 'uniform vec4 uAudio;', 'uniform float uAlert;', 'uniform float uPixelScale;', 'uniform float u_vitesse;', 'uniform vec3 u_teinte;']) {
      expect(before).toContain(declaration);
    }
  });

  test('les alias de Shadertoy existent', () => {
    expect(source).toContain('#define iResolution vec3(uResolution, 1.0)');
    expect(source).toContain('#define iTime uTime');
    expect(source).toContain('#define iMouse vec4(0.0)');
  });

  test('le code de l’auteur suit immédiatement #line 1 : le journal du compilateur compte ses lignes à lui', () => {
    const at = lines.indexOf('#line 1');
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe('void mainImage(out vec4 fragColor, in vec2 fragCoord) {');
    expect(authorLines).toBe(3);
  });

  test('l’enveloppe appelle mainImage en pixels de référence et prémultiplie la couleur', () => {
    expect(source).toContain('mainImage(shaded, gl_FragCoord.xy * uPixelScale);');
    expect(source).toContain('outColor = vec4(clamp(shaded.rgb, 0.0, 1.0) * alpha, alpha);');
  });
});

describe('parseCompileLog', () => {
  test('une ligne du journal devient un compte rendu à la ligne du texte de l’auteur', () => {
    expect(parseCompileLog("ERROR: 0:3: 'nope' : undeclared identifier\n", 5)).toEqual([{ message: "'nope' : undeclared identifier", line: 3, column: null }]);
  });

  test('plusieurs erreurs, dans l’ordre ; les avertissements et les lignes vides sont ignorés', () => {
    const reports = parseCompileLog("WARNING: 0:1: 'x' : unused\nERROR: 0:2: 'a' : bad\n\nERROR: 0:4: 'b' : worse\n", 6);
    expect(reports.map(({ line }) => line)).toEqual([2, 4]);
  });

  test('une erreur au-delà du texte de l’auteur vient de l’enveloppe : on dit ce qui manque, sans fausse ligne', () => {
    const [report] = parseCompileLog("ERROR: 0:7: 'mainImage' : no matching overloaded function found\n", 6);
    expect(report.line).toBeNull();
    expect(report.message).toContain('mainImage');
    expect(report.message).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
  });

  test('l’erreur de la première ligne est bien la ligne 1, celle de la dernière la dernière', () => {
    expect(parseCompileLog("ERROR: 0:1: 'version' : x\n", 4)[0].line).toBe(1);
    expect(parseCompileLog("ERROR: 0:4: 'x' : y\n", 4)[0].line).toBe(4);
    expect(parseCompileLog("ERROR: 0:5: 'x' : y\n", 4)[0].line).toBeNull();
    expect(parseCompileLog("ERROR: 0:0: 'x' : y\n", 4)[0].line).toBeNull();
  });

  test('un journal d’édition de liens (sans numéro de ligne) est gardé tel quel, un journal vide donne tout de même un compte rendu', () => {
    expect(parseCompileLog('ERROR: Varyings mismatch\n', 3)).toEqual([{ message: 'ERROR: Varyings mismatch', line: null, column: null }]);
    expect(parseCompileLog('', 3)).toEqual([{ message: 'compilation refusée', line: null, column: null }]);
  });

  test('un message très long est borné', () => {
    expect(parseCompileLog(`ERROR: 0:1: ${'x'.repeat(1000)}\n`, 2)[0].message.length).toBe(300);
  });
});
