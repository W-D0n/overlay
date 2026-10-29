// @ts-check
import { clampOptions, neutralizeOptions, resolveKindId, validateOptions } from './layer-kinds.js';

/**
 * scene-doc.js — Document de scène : une pile ordonnée de couches (docs/specs/scene-doc-etape-4.md).
 *
 * Module pur, sans DOM : formes, validation, forme canonique, chemins adressables (pour la future
 * timeline) et passage preset ↔ scène à une couche. Les positions sont des fractions du canvas, de
 * sorte qu'un document reste valable quelle que soit la résolution de la source OBS.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Placement
 * @typedef {{
 *   id: string,
 *   kind: import('./layer-kinds.js').LayerKindId,
 *   name?: string,
 *   visible: boolean,
 *   opacity: number,
 *   placement: Placement,
 *   options: Record<string, unknown>,
 * }} Layer
 * @typedef {{
 *   version: 1,
 *   id: string,
 *   name: string,
 *   tags?: string[],
 *   transition?: import('./background-transition.js').BackgroundTransition,
 *   showBranding?: boolean,
 *   layers: Layer[],
 * }} SceneDoc
 * @typedef {{ id: string, name: string, component: string, options: Record<string, unknown>, tags?: string[], transition?: import('./background-transition.js').BackgroundTransition, showBranding?: boolean }} PresetLike
 */

export const SCENE_DOC_VERSION = 1;
/** Garde de charge : chaque couche est un canvas. À réviser après la mesure à 1 puis 3 couches. */
export const MAX_LAYERS = 8;
/** Identifiant de la couche d'un preset devenu scène. */
export const MAIN_LAYER_ID = 'main';

/** Les identifiants servent dans les chemins (`layers[<id>].…`) : ni point ni crochet. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ID_MAX_LENGTH = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @type {Readonly<Placement>} */
export const FULL_PLACEMENT = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is number} */
function isFraction(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** @param {number} value @param {number} low @param {number} high */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * @param {{ id: string, kind: import('./layer-kinds.js').LayerKindId, options?: Record<string, unknown> } & Partial<Layer>} input
 * @returns {Layer}
 */
export function createLayer(input) {
  return {
    ...input,
    id: input.id,
    kind: input.kind,
    visible: input.visible ?? true,
    opacity: input.opacity ?? 1,
    placement: input.placement ?? { ...FULL_PLACEMENT },
    options: input.options ?? {},
  };
}

/**
 * @param {PresetLike} preset
 * @returns {SceneDoc}
 */
export function sceneFromPreset(preset) {
  /** @type {SceneDoc} */
  const scene = {
    version: SCENE_DOC_VERSION,
    id: preset.id,
    name: preset.name,
    layers: [createLayer({
      id: MAIN_LAYER_ID,
      kind: /** @type {import('./layer-kinds.js').LayerKindId} */ (resolveKindId(preset.component) ?? preset.component),
      options: preset.options,
    })],
  };
  if (preset.tags !== undefined) scene.tags = preset.tags;
  if (preset.transition !== undefined) scene.transition = preset.transition;
  if (preset.showBranding !== undefined) scene.showBranding = preset.showBranding;
  return scene;
}

/**
 * Inverse de `sceneFromPreset`. Une scène à plusieurs couches n'est pas un preset : `null`, plutôt
 * qu'une couche choisie au hasard.
 * @param {SceneDoc} scene
 * @returns {PresetLike | null}
 */
export function presetFromScene(scene) {
  if (scene.layers.length !== 1) return null;
  const [layer] = scene.layers;
  /** @type {PresetLike} */
  const preset = { id: scene.id, name: scene.name, component: layer.kind, options: layer.options };
  if (scene.tags !== undefined) preset.tags = scene.tags;
  if (scene.transition !== undefined) preset.transition = scene.transition;
  if (scene.showBranding !== undefined) preset.showBranding = scene.showBranding;
  return preset;
}

/**
 * Forme canonique : identifiants de types et valeurs d'options neutres (lecture tolérante des anciens
 * noms), nombres ramenés dans leurs bornes, opacité et placement bornés. Ne valide rien ; l'objet reçu
 * n'est pas modifié et les champs inconnus sont conservés.
 * @param {SceneDoc} scene
 * @returns {SceneDoc}
 */
export function canonicalSceneDoc(scene) {
  if (!isPlainObject(scene) || !Array.isArray(scene.layers)) return scene;
  return {
    ...scene,
    layers: /** @type {Layer[]} */ (scene.layers.map((layer) => {
      if (!isPlainObject(layer)) return layer;
      const kind = resolveKindId(layer.kind) ?? layer.kind;
      const options = isPlainObject(layer.options) ? clampOptions(kind, neutralizeOptions(layer.options)) : layer.options;
      const placement = isPlainObject(layer.placement) ? canonicalPlacement(layer.placement) : layer.placement;
      const opacity = isFraction(layer.opacity) ? clamp(layer.opacity, 0, 1) : layer.opacity;
      return { ...layer, kind, options, placement, opacity };
    })),
  };
}

/** @param {Record<string, unknown>} placement */
function canonicalPlacement(placement) {
  const bounded = { ...placement };
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = placement[key];
    if (isFraction(value)) bounded[key] = clamp(value, key === 'width' || key === 'height' ? 0.001 : -1, 2);
  }
  return bounded;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateSceneDoc(raw) {
  /** @type {string[]} */
  const errors = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['scène : objet attendu'] };

  if (raw.version !== SCENE_DOC_VERSION) errors.push(`version : ${SCENE_DOC_VERSION} attendue`);
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || raw.id.length > ID_MAX_LENGTH) {
    errors.push('id : identifiant de scène invalide');
  }
  if (typeof raw.name !== 'string' || raw.name.trim() === '') errors.push('name : texte non vide attendu');
  if (raw.tags !== undefined && !(Array.isArray(raw.tags) && raw.tags.every((tag) => typeof tag === 'string'))) {
    errors.push('tags : liste de textes attendue');
  }
  if (raw.showBranding !== undefined && typeof raw.showBranding !== 'boolean') errors.push('showBranding : booléen attendu');

  if (!Array.isArray(raw.layers)) {
    errors.push('layers : liste attendue');
    return { ok: false, errors };
  }
  if (raw.layers.length < 1) errors.push('layers : au moins une couche');
  if (raw.layers.length > MAX_LAYERS) errors.push(`layers : ${MAX_LAYERS} couches au plus`);

  const seen = new Set();
  raw.layers.forEach((layer, index) => {
    const where = isPlainObject(layer) && typeof layer.id === 'string' ? `layers[${layer.id}]` : `layers[#${index}]`;
    if (!isPlainObject(layer)) {
      errors.push(`${where} : objet attendu`);
      return;
    }
    if (typeof layer.id !== 'string' || !ID_PATTERN.test(layer.id) || layer.id.length > ID_MAX_LENGTH) {
      errors.push(`${where} : identifiant de couche invalide`);
    } else if (seen.has(layer.id)) {
      errors.push(`${where} : identifiant dupliqué`);
    } else {
      seen.add(layer.id);
    }
    if (resolveKindId(layer.kind) === null) errors.push(`${where}.kind : type de couche inconnu`);
    if (typeof layer.visible !== 'boolean') errors.push(`${where}.visible : booléen attendu`);
    if (!isFraction(layer.opacity)) errors.push(`${where}.opacity : nombre attendu`);
    errors.push(...placementErrors(where, layer.placement));
    if (!isPlainObject(layer.options)) errors.push(`${where}.options : objet attendu`);
    else errors.push(...validateOptions(layer.kind, layer.options).map((message) => `${where}.options.${message}`));
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** @param {string} where @param {unknown} placement @returns {string[]} */
function placementErrors(where, placement) {
  if (!isPlainObject(placement)) return [`${where}.placement : objet attendu`];
  /** @type {string[]} */
  const errors = [];
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!isFraction(placement[key])) errors.push(`${where}.placement.${key} : nombre attendu`);
  }
  for (const key of ['width', 'height']) {
    if (isFraction(placement[key]) && /** @type {number} */ (placement[key]) <= 0) {
      errors.push(`${where}.placement.${key} : supérieur à 0 attendu`);
    }
  }
  return errors;
}

// ── Chemins adressables ──────────────────────────────────────────────────────

const LAYER_SCALARS = new Set(['name', 'visible', 'opacity']);
const PLACEMENT_KEYS = new Set(['x', 'y', 'width', 'height']);

/**
 * Chemin vers une propriété modifiable : `name`, `showBranding`, `layers[<id>].visible`,
 * `layers[<id>].opacity`, `layers[<id>].name`, `layers[<id>].placement.<x|y|width|height>` ou
 * `layers[<id>].options.<clé>`. L'identité (`id`, `kind`) et l'ordre sont structurels : pas de chemin.
 * @param {string} path
 * @returns {{ layerId: string | null, field: 'scene' | 'layer' | 'placement' | 'options', key: string } | null}
 */
function parsePath(path) {
  if (path === 'name' || path === 'showBranding') return { layerId: null, field: 'scene', key: path };
  const match = /^layers\[([^\].]+)\]\.(.+)$/.exec(path);
  if (match === null) return null;
  const [, layerId, rest] = match;
  const parts = rest.split('.');
  if (parts.length === 1 && LAYER_SCALARS.has(parts[0])) return { layerId, field: 'layer', key: parts[0] };
  if (parts.length === 2 && parts[0] === 'placement' && PLACEMENT_KEYS.has(parts[1])) {
    return { layerId, field: 'placement', key: parts[1] };
  }
  if (parts.length === 2 && parts[0] === 'options' && parts[1] !== '' && !FORBIDDEN_KEYS.has(parts[1])) {
    return { layerId, field: 'options', key: parts[1] };
  }
  return null;
}

/**
 * @param {SceneDoc} scene
 * @param {string} path
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function readPath(scene, path) {
  const target = parsePath(path);
  if (target === null) return { ok: false, error: `chemin invalide : ${path}` };
  if (target.layerId === null) return { ok: true, value: /** @type {Record<string, unknown>} */ (scene)[target.key] };
  const layer = scene.layers.find(({ id }) => id === target.layerId);
  if (layer === undefined) return { ok: false, error: `couche introuvable : ${target.layerId}` };
  const holder = target.field === 'layer' ? layer : layer[/** @type {'placement' | 'options'} */ (target.field)];
  return { ok: true, value: /** @type {Record<string, unknown>} */ (holder)[target.key] };
}

/**
 * Nouvelle scène avec la propriété écrite ; la scène reçue n'est pas modifiée. Ne valide pas la valeur :
 * l'appelant passe par `validateSceneDoc` / `canonicalSceneDoc`.
 * @param {SceneDoc} scene
 * @param {string} path
 * @param {unknown} value
 * @returns {{ ok: true, scene: SceneDoc } | { ok: false, error: string }}
 */
export function writePath(scene, path, value) {
  const target = parsePath(path);
  if (target === null) return { ok: false, error: `chemin invalide : ${path}` };
  if (target.layerId === null) return { ok: true, scene: { ...scene, [target.key]: value } };
  const { layerId } = target;
  if (!scene.layers.some(({ id }) => id === layerId)) return { ok: false, error: `couche introuvable : ${layerId}` };
  return {
    ok: true,
    scene: {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        if (target.field === 'layer') return { ...layer, [target.key]: value };
        const field = /** @type {'placement' | 'options'} */ (target.field);
        return { ...layer, [field]: { ...layer[field], [target.key]: value } };
      }),
    },
  };
}
