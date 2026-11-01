import { describe, expect, test } from 'bun:test';
import { MAX_PARAMS, normalizeParamValues, paramCssVariables, paramFieldSchemas, parseParamSpec } from './code-params.js';

const SPEC = JSON.stringify([
  { key: 'couleur', label: 'Couleur', type: 'color', default: '#C8B97A' },
  { key: 'taille', label: 'Taille', type: 'number', default: 120, min: 20, max: 400, step: 1 },
  { key: 'actif', type: 'boolean', default: true },
  { key: 'mode', label: 'Mode', type: 'select', choices: ['a', 'b'], default: 'a' },
  { key: 'titre', type: 'text', default: 'Bonjour' },
]);

describe('parseParamSpec', () => {
  test('une déclaration valide donne ses réglages, sans défaut', () => {
    const { params, errors } = parseParamSpec(SPEC);
    expect(errors).toEqual([]);
    expect(params.map((param) => param.key)).toEqual(['couleur', 'taille', 'actif', 'mode', 'titre']);
    expect(params[2].label).toBe('actif');
  });

  test('vide ou absente : aucun réglage, aucune erreur', () => {
    expect(parseParamSpec('')).toEqual({ params: [], errors: [] });
    expect(parseParamSpec(undefined)).toEqual({ params: [], errors: [] });
  });

  test('un JSON illisible ou qui n’est pas une liste ne casse rien : zéro réglage et la raison', () => {
    expect(parseParamSpec('[ { ').params).toEqual([]);
    expect(parseParamSpec('[ { ').errors[0]).toContain('JSON invalide');
    expect(parseParamSpec('{"key":"a"}').errors[0]).toContain('une liste');
  });

  test('un réglage invalide est écarté avec sa raison, les autres restent', () => {
    const { params, errors } = parseParamSpec(JSON.stringify([
      { key: 'Bad Key', type: 'number', default: 1 },
      { key: 'ok', type: 'number', default: 1 },
      { key: 'inconnu', type: 'slider', default: 1 },
      { key: 'sansdefaut', type: 'number' },
      { key: 'choix', type: 'select', choices: ['a'], default: 'z' },
      { key: 'bornes', type: 'number', default: 1, min: 5, max: 2 },
      42,
    ]));
    expect(params.map((param) => param.key)).toEqual(['ok']);
    expect(errors).toHaveLength(6);
    expect(errors.join(' | ')).toContain('la clé doit commencer par une minuscule');
    expect(errors.join(' | ')).toContain('type inconnu');
    expect(errors.join(' | ')).toContain('« min » dépasse « max »');
  });

  test('une clé en double est refusée, pas écrasée', () => {
    const { params, errors } = parseParamSpec(JSON.stringify([{ key: 'a', type: 'text', default: 'x' }, { key: 'a', type: 'text', default: 'y' }]));
    expect(params).toHaveLength(1);
    expect(params[0].default).toBe('x');
    expect(errors[0]).toContain('déjà prise');
  });

  test('plus de 24 réglages : les suivants sont ignorés, une seule fois signalé', () => {
    const many = Array.from({ length: MAX_PARAMS + 3 }, (_, index) => ({ key: `p${index}`, type: 'boolean', default: false }));
    const { params, errors } = parseParamSpec(JSON.stringify(many));
    expect(params).toHaveLength(MAX_PARAMS);
    expect(errors).toHaveLength(1);
  });

  test('le défaut d’un nombre est ramené dans ses bornes', () => {
    const { params } = parseParamSpec(JSON.stringify([{ key: 'n', type: 'number', default: 999, min: 0, max: 10 }]));
    expect(params[0].default).toBe(10);
  });

  test('une déclaration démesurée est refusée avant d’être lue', () => {
    expect(parseParamSpec(`[${' '.repeat(30_000)}]`).errors[0]).toContain('dépasse');
  });
});

describe('normalizeParamValues', () => {
  const { params } = parseParamSpec(SPEC);

  test('les valeurs données qui conviennent sont gardées, les autres reprennent le défaut', () => {
    const values = normalizeParamValues(params, { couleur: '#fff', taille: 'grand', actif: false, mode: 'z', titre: 3 });
    expect(values).toEqual({ couleur: '#fff', taille: 120, actif: false, mode: 'a', titre: 'Bonjour' });
  });

  test('un nombre est ramené dans ses bornes', () => {
    expect(normalizeParamValues(params, { taille: 5000 }).taille).toBe(400);
    expect(normalizeParamValues(params, { taille: -3 }).taille).toBe(20);
  });

  test('une clé que la déclaration ne connaît plus est écartée', () => {
    expect(Object.keys(normalizeParamValues(params, { fantome: 1, taille: 50 }))).not.toContain('fantome');
  });

  test('rien de lisible donne tous les défauts', () => {
    expect(normalizeParamValues(params, null).taille).toBe(120);
    expect(normalizeParamValues(params, [1, 2]).taille).toBe(120);
  });

  test('une clé héritée (__proto__, constructor) n’est jamais lue comme valeur', () => {
    const risky = parseParamSpec(JSON.stringify([{ key: 'constructor', type: 'text', default: 'sûr' }])).params;
    expect(normalizeParamValues(risky, {}).constructor).toBe('sûr');
  });
});

describe('paramFieldSchemas', () => {
  test('chaque réglage devient un champ du Studio, avec ses bornes', () => {
    const { params } = parseParamSpec(SPEC);
    const fields = paramFieldSchemas(params);
    expect(fields.map((field) => field.type)).toEqual(['color', 'number', 'boolean', 'select', 'text']);
    expect(fields[1]).toMatchObject({ key: 'taille', min: 20, max: 400, step: 1, control: 'slider' });
    expect(fields[3].choices).toEqual(['a', 'b']);
  });
});

describe('paramCssVariables', () => {
  test('--param-<clé> : un nombre sans unité, un booléen en 1/0, un texte entre guillemets, une couleur brute', () => {
    const { params } = parseParamSpec(SPEC);
    const variables = paramCssVariables(params, normalizeParamValues(params, { titre: 'a "b"\nc' }));
    expect(variables).toEqual({
      '--param-couleur': '#C8B97A',
      '--param-taille': '120',
      '--param-actif': '1',
      '--param-mode': 'a',
      '--param-titre': '"a \\"b\\" c"',
    });
  });
});
