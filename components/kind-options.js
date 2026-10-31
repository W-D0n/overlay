// @ts-check
import { LAYER_KINDS, clampOptions } from '../layer-kinds.js';

/**
 * components/kind-options.js — Les options complètes d'une couche de contenu, lues de son schéma (`layer-kinds.js`).
 * Une seule source pour les défauts, les types et les bornes : les couches de contenu (texte, forme…) n'ont aucune table à tenir à jour.
 */

/**
 * Les options de départ d'un type de couche : le défaut de chaque champ du schéma.
 * @param {import('../layer-kinds.js').LayerKindId} kind
 * @returns {Record<string, unknown>}
 */
export function kindDefaults(kind) {
  return Object.fromEntries(LAYER_KINDS[kind].fields.map((field) => [field.key, field.default]));
}

/**
 * Des options reçues (peut-être partielles, anciennes ou invalides) aux options complètes : défaut pour tout champ absent ou de
 * mauvais type (nombre, booléen, liste de lignes, valeur d'une liste de choix), nombres bornés par le schéma.
 * @param {import('../layer-kinds.js').LayerKindId} kind
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeKindOptions(kind, raw) {
  const source = typeof raw === 'object' && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};
  const merged = kindDefaults(kind);
  for (const field of LAYER_KINDS[kind].fields) {
    const value = source[field.key];
    if (value === undefined) continue;
    const valid = field.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : field.type === 'boolean' ? typeof value === 'boolean'
        : field.type === 'textarea' || field.type === 'colors' ? Array.isArray(value) && value.every((line) => typeof line === 'string')
          : typeof value === 'string' && (field.type !== 'select' || (field.choices ?? []).includes(value));
    if (valid) merged[field.key] = value;
  }
  return clampOptions(kind, merged);
}
