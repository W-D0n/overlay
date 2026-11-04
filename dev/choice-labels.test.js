import { describe, expect, test } from 'bun:test';
import { LAYER_KINDS, LAYER_KIND_IDS } from '../layer-kinds.js';
import { CHOICE_LABELS } from './choice-labels.js';
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';

/** Every list setting of every type: `<type>.<réglage>` and its stored choices. */
const lists = LAYER_KIND_IDS.flatMap((kind) => LAYER_KINDS[kind].fields.filter((field) => field.type === 'select').map((field) => ({ id: `${kind}.${field.key}`, choices: field.choices ?? [] })));

describe('libellés des choix', () => {
  test('la mesure voit les listes (elle ne passe pas à vide)', () => {
    expect(lists.length).toBeGreaterThanOrEqual(18);
    expect(lists.find(({ id }) => id === 'dotgrid.colorMode')?.choices).toEqual(['flat', 'noise', 'glow']);
  });

  test('chaque liste a ses libellés, un par choix', () => {
    const missing = lists.flatMap(({ id, choices }) => choices.filter((choice) => CHOICE_LABELS[id]?.[choice] === undefined).map((choice) => `${id} : ${choice}`));
    expect(missing).toEqual([]);
  });

  test('aucun libellé ne concerne une liste ou un choix qui n’existe plus', () => {
    const known = new Map(lists.map(({ id, choices }) => [id, new Set(choices)]));
    const stale = Object.entries(CHOICE_LABELS).flatMap(([id, labels]) => (known.has(id) ? Object.keys(labels).filter((choice) => !known.get(id)?.has(choice)).map((choice) => `${id} : ${choice}`) : [`${id} : liste inconnue`]));
    expect(stale).toEqual([]);
  });

  test('un libellé est un texte à lire, pas l’identifiant stocké, et deux choix d’une liste ne se confondent pas', () => {
    for (const { id, choices } of lists) {
      const labels = choices.map((choice) => CHOICE_LABELS[id][choice]);
      for (const [index, label] of labels.entries()) {
        expect(label.trim().length, `${id} : ${choices[index]}`).toBeGreaterThan(0);
        expect(label, `${id} : ${choices[index]} montre l’identifiant`).not.toBe(choices[index]);
      }
      expect(new Set(labels).size, `${id} : deux libellés identiques`).toBe(labels.length);
    }
  });

  test('la vue « formulaire » joint les libellés aux listes, et à elles seules', () => {
    const schemas = BACKGROUND_FIELD_SCHEMAS;
    for (const [kind, fields] of Object.entries(schemas)) {
      for (const field of fields) {
        if (field.type === 'select') expect(field.choiceLabels, `${kind}.${field.key}`).toEqual(CHOICE_LABELS[`${kind}.${field.key}`]);
        else expect(field.choiceLabels, `${kind}.${field.key}`).toBeUndefined();
      }
    }
  });
});
