// @ts-check
/**
 * dev/layer-templates.js — Les modèles de couches : une sélection de couches (réglages, placements, opacités comprises)
 * enregistrée sous un nom, à insérer dans n'importe quelle scène. Logique pure ; le stockage est dans les réglages du Studio
 * (serveur, donc partagé entre navigateur et application de bureau) et l'interface dans `templates-controller.js`.
 *
 * @typedef {import('./studio-settings.js').StoredTemplate} StoredTemplate
 * @typedef {import('../scene-doc.js').Layer} Layer
 */
import { SETTINGS_LIMITS } from './studio-settings.js';
import { slugify } from './custom-commands.js';

export const TEMPLATE_PREFIX = 'tpl.';

/**
 * Un identifiant libre à partir du nom.
 * @param {string} name
 * @param {Iterable<string>} used
 */
export function uniqueTemplateId(name, used) {
  const taken = new Set(used);
  const base = `${TEMPLATE_PREFIX}${slugify(name)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Ce qui empêche ce nom : vide, trop long, ou déjà pris par un autre modèle.
 * @param {string} name
 * @param {readonly StoredTemplate[]} templates
 * @param {string | null} [exceptId] le modèle qu'on renomme
 * @returns {string | null}
 */
export function templateNameError(name, templates, exceptId = null) {
  const trimmed = name.trim();
  if (trimmed === '') return 'le nom est obligatoire';
  if (trimmed.length > SETTINGS_LIMITS.nameLength) return `le nom dépasse ${SETTINGS_LIMITS.nameLength} caractères`;
  if (templates.some((other) => other.id !== exceptId && other.name.toLowerCase() === trimmed.toLowerCase())) return `un modèle s'appelle déjà « ${trimmed} »`;
  return null;
}

/**
 * Le modèle d'une sélection. Le verrou ne se garde pas (une couche insérée est toujours libre), le reste oui.
 * @param {string} name
 * @param {readonly Layer[]} layers
 * @param {readonly StoredTemplate[]} templates les modèles existants
 * @returns {{ ok: true, template: StoredTemplate } | { ok: false, error: string }}
 */
export function createTemplate(name, layers, templates) {
  if (layers.length === 0) return { ok: false, error: 'sélectionnez au moins une couche' };
  const problem = templateNameError(name, templates);
  if (problem !== null) return { ok: false, error: problem };
  const copy = structuredClone([...layers]).map(({ locked: _locked, ...free }) => free);
  return { ok: true, template: { id: uniqueTemplateId(name, templates.map(({ id }) => id)), name: name.trim(), layers: /** @type {Layer[]} */ (copy) } };
}

/**
 * « 3 couches : Pluie, Bulles, Identité ».
 * @param {StoredTemplate} template
 * @param {(kind: string) => string} labelOf
 */
export function describeTemplate(template, labelOf) {
  const count = template.layers.length;
  return `${count} couche${count > 1 ? 's' : ''} : ${template.layers.map((layer) => layer.name ?? labelOf(layer.kind)).join(', ')}`;
}
