import { describe, expect, test } from 'bun:test';
import { MAX_PARAMS, normalizeParamValues, paramCssVariables, paramFieldSchemas, parseParamSpec } from './code-params.js';

const SPEC = JSON.stringify([
  { key: 'couleur', label: 'Couleur', type: 'color', default: '#C8B97A' },
  { key: 'taille', label: 'Taille', type: 'number', default: 120, min: 20, max: 400, step: 1 },
  { key: 'actif', type: 'boolean', default: true },
  { key: 'mode', label: 'Mode', type: 'select', choices: ['a', 'b'], default: 'a' },
  { key: 'titre', type: 'text', default: 'Bonjour' },
]);

describe('parseParamSpec : chaque type lit son entrée, et refuse ce qui ne lui convient pas', () => {
  const one = (entry) => parseParamSpec(JSON.stringify([entry]));
  const defect = (entry) => one(entry).errors[0];

  test('an entry that is not an object (a list, a number, null) is refused as such', () => {
    for (const entry of [[], 3, null, 'texte']) expect(defect(entry)).toContain('un objet est attendu');
  });

  test('the label is trimmed and cut to 60 characters; a blank or missing one is the key', () => {
    expect(one({ key: 'a', label: '  Vitesse  ', type: 'boolean', default: true }).params[0].label).toBe('Vitesse');
    expect(one({ key: 'a', label: 'x'.repeat(100), type: 'boolean', default: true }).params[0].label).toBe('x'.repeat(60));
    expect(one({ key: 'a', label: '   ', type: 'boolean', default: true }).params[0].label).toBe('a');
    expect(one({ key: 'a', type: 'boolean', default: true }).params[0].label).toBe('a');
  });

  test('a number: a default that is a number, bounds that agree, a positive step only', () => {
    expect(defect({ key: 'n', type: 'number', default: '3' })).toContain('doit être un nombre');
    expect(defect({ key: 'n', type: 'number', default: 3, min: 5, max: 1 })).toContain('« min » dépasse « max »');
    expect(one({ key: 'n', type: 'number', default: 3, step: 0 }).params[0]).not.toHaveProperty('step');
    expect(one({ key: 'n', type: 'number', default: 3, step: -1 }).params[0]).not.toHaveProperty('step');
    expect(one({ key: 'n', type: 'number', default: 3, step: 0.5 }).params[0].step).toBe(0.5);
    expect(one({ key: 'n', type: 'number', default: 3, min: 'a', max: null }).params[0]).toEqual({ key: 'n', label: 'n', type: 'number', default: 3 });
  });

  test('a number default is brought into its bounds', () => {
    expect(one({ key: 'n', type: 'number', default: 500, min: 0, max: 100 }).params[0].default).toBe(100);
    expect(one({ key: 'n', type: 'number', default: -5, min: 0, max: 100 }).params[0].default).toBe(0);
  });

  test('a boolean needs a boolean default', () => {
    for (const fallback of [1, 'true', null]) expect(defect({ key: 'b', type: 'boolean', default: fallback })).toContain('true ou false');
    expect(one({ key: 'b', type: 'boolean', default: false }).errors).toEqual([]);
  });

  test('a select: 1 to 24 non-empty texts of at most 60 characters, and a default among them', () => {
    const select = (choices, fallback = 'a') => ({ key: 's', type: 'select', choices, default: fallback });
    expect(defect(select([]))).toContain('« choices »');
    expect(defect(select('a'))).toContain('« choices »');
    expect(defect(select(Array.from({ length: 25 }, (_, i) => `c${i}`), 'c0'))).toContain('« choices »');
    expect(one(select(Array.from({ length: 24 }, (_, i) => `c${i}`), 'c0')).errors).toEqual([]);
    expect(defect(select(['a', ''], 'a'))).toContain('« choices »');
    expect(defect(select(['a', 3], 'a'))).toContain('« choices »');
    expect(defect(select(['a', 'x'.repeat(61)], 'a'))).toContain('« choices »');
    expect(one(select(['a', 'x'.repeat(60)], 'a')).errors).toEqual([]);
    expect(defect(select(['a', 'b'], 'c'))).toContain('l\'un des choix');
    expect(defect(select(['a', 'b'], 3))).toContain('l\'un des choix');
    expect(one(select(['a', 'b'], 'b')).params[0].choices).toEqual(['a', 'b']);
  });

  test('a text or a color needs a text default, cut to 500 characters', () => {
    for (const type of ['text', 'color']) {
      expect(defect({ key: 't', type, default: 3 })).toContain('doit être un texte');
      expect(one({ key: 't', type, default: 'x'.repeat(600) }).params[0].default).toBe('x'.repeat(500));
      expect(one({ key: 't', type, default: 'ok' }).params[0].type).toBe(type);
    }
  });
});

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
