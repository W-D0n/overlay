// @ts-check
import { validateTransition } from './background-transition.js';
import { bindingErrors, canonicalBindings } from './layer-bindings.js';
import { canonicalSceneTimeline, canonicalTracks, sceneTimelineErrors, trackErrors } from './layer-timeline.js';
import { clampOptions, isIdentityKind, neutralizeOptions, resolveKindId, validateOptions } from './layer-kinds.js';

/**
 * scene-doc.js — Document de scène : une pile ordonnée de couches (docs/specs/scene-doc-etape-4.md).
 *
 * Module pur, sans DOM : formes, validation, forme canonique, chemins adressables (pour la future
 * timeline) et passage preset ↔ scène à une couche. Les positions sont des fractions du canvas, de
 * sorte qu'un document reste valable quelle que soit la résolution de la source OBS.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Placement
 * @typedef {{ top: number, right: number, bottom: number, left: number }} Crop
 * @typedef {keyof Crop} CropSide
 * @typedef {'normal' | 'multiply' | 'screen' | 'overlay'} BlendMode
 * @typedef {{
 *   id: string,
 *   kind: import('./layer-kinds.js').LayerKindId,
 *   name?: string,
 *   visible: boolean,
 *   locked?: boolean,
 *   opacity: number,
 *   placement: Placement,
 *   blend?: BlendMode,
 *   rotation?: number,
 *   crop?: Crop,
 *   blur?: number,
 *   bindings?: import('./layer-bindings.js').Binding[],
 *   timeline?: import('./layer-timeline.js').Track[],
 *   options: Record<string, unknown>,
 * }} Layer
 * @typedef {{
 *   version: 1,
 *   id: string,
 *   name: string,
 *   tags?: string[],
 *   transition?: import('./background-transition.js').BackgroundTransition,
 *   timeline?: import('./layer-timeline.js').SceneTimeline,
 *   layers: Layer[],
 * }} SceneDoc
 * @typedef {{ id: string, name: string, component: string, options: Record<string, unknown>, tags?: string[], transition?: import('./background-transition.js').BackgroundTransition, showBranding?: boolean }} PresetLike
 */

export const SCENE_DOC_VERSION = 1;

/** Identité de la scène en antenne : l'état courant n'est pas un preset, il n'a ni id ni nom propres. */
export const CURRENT_SCENE = Object.freeze({ id: 'current', name: 'En antenne' });
/** Garde de charge : chaque couche est un canvas. À réviser après la mesure à 1 puis 3 couches. */
export const MAX_LAYERS = 8;
/** Identifiant de la couche d'un preset devenu scène. */
export const MAIN_LAYER_ID = 'main';
/** Identifiant de la couche de branding d'une scène qui l'affiche. */
export const BRANDING_LAYER_ID = 'branding';

/** Les identifiants servent dans les chemins (`layers[<id>].…`) : ni point ni crochet. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ID_MAX_LENGTH = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Le rendu étendu d'une couche (étape 6d), et ses liaisons (`layer-bindings.js`). Absent = neutre : un document sans ces champs reste valide et se rend comme avant.
 * Seules les valeurs mesurées dans OBS (`dev/obs-bench.html`) sont proposées : fusion produit / superposition claire /
 * incrustation, rotation, rognage, flou. Le flou se compte en pixels de la source de référence (`render-reference.js`).
 */
export const BLEND_MODES = Object.freeze([
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'multiply', label: 'Produit' }),
  Object.freeze({ id: 'screen', label: 'Superposition claire' }),
  Object.freeze({ id: 'overlay', label: 'Incrustation' }),
]);
export const LOOK_LIMITS = Object.freeze({
  rotation: Object.freeze({ min: -180, max: 180 }),
  blur: Object.freeze({ min: 0, max: 12 }),
  /** Part de la toile rognée par côté ; deux côtés opposés ne dépassent jamais `cropPair` ensemble (la couche ne disparaît pas). */
  crop: Object.freeze({ min: 0, max: 0.9 }),
  cropPair: 0.95,
});
export const CROP_SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);
export const CROP_LABELS = Object.freeze({ top: 'haut', right: 'droite', bottom: 'bas', left: 'gauche' });
/** Les champs de rendu étendu d'une couche. */
export const LOOK_KEYS = /** @type {const} */ (['blend', 'rotation', 'crop', 'blur', 'bindings', 'timeline']);

/** La couche sans son rendu étendu.
 * @param {Layer} layer
 * @returns {Layer}
 */
export function withoutLook(layer) {
  const { blend: _blend, rotation: _rotation, crop: _crop, blur: _blur, bindings: _bindings, timeline: _timeline, ...plain } = layer;
  return plain;
}

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
 * Le branding d'une scène : une couche d'identité pleine page, au contenu global (`branding-content.js`).
 * @returns {Layer}
 */
function brandingLayer() {
  return createLayer({ id: BRANDING_LAYER_ID, kind: 'branding' });
}

/**
 * Une couche « simple » : visible, opaque, pleine page. Seules les couches simples se projettent sur la forme
 * historique `{ component, options }` ; une couche déplacée, masquée ou atténuée ne doit jamais s'y perdre en silence.
 * @param {Layer} layer
 */
function isPlainLayer(layer) {
  const { x, y, width, height } = layer.placement;
  return layer.visible && layer.opacity === 1 && x === 0 && y === 0 && width === 1 && height === 1 && LOOK_KEYS.every((key) => layer[key] === undefined);
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
  // Absent ou vrai : le branding est affiché, il est une couche de la scène. Faux : la scène n'en a pas.
  if (preset.showBranding !== false) scene.layers.push(brandingLayer());
  if (preset.tags !== undefined) scene.tags = preset.tags;
  if (preset.transition !== undefined) scene.transition = preset.transition;
  return scene;
}

/**
 * L'état courant `{ component, options, transition?, showBranding? }` (ce que le serveur diffuse) comme scène en
 * antenne. `component: null` (aucun fond) donne une scène du seul branding, ou sans couche s'il est masqué.
 * @param {{ component: string | null, options: Record<string, unknown>, transition?: import('./background-transition.js').BackgroundTransition, showBranding?: boolean }} current
 * @returns {SceneDoc}
 */
export function sceneFromCurrent(current) {
  if (current.component === null) {
    /** @type {SceneDoc} */
    const empty = { version: SCENE_DOC_VERSION, ...CURRENT_SCENE, layers: current.showBranding === false ? [] : [brandingLayer()] };
    if (current.transition !== undefined) empty.transition = current.transition;
    return empty;
  }
  return sceneFromPreset({ ...CURRENT_SCENE, component: current.component, options: current.options, ...(current.transition === undefined ? {} : { transition: current.transition }), ...(current.showBranding === undefined ? {} : { showBranding: current.showBranding }) });
}

/**
 * La scène d'un preset mise à l'antenne : mêmes couches et même transition, sous l'identité de l'antenne et sans les
 * étiquettes (qui appartiennent au preset).
 * @param {SceneDoc} scene
 * @returns {SceneDoc}
 */
export function liveFromScene(scene) {
  const { tags: _tags, ...rest } = scene;
  return { ...rest, ...CURRENT_SCENE };
}

/**
 * La scène telle que la montre une Browser Source selon son réglage `?branding=` : `on` la scène entière, `off` sans
 * ses couches d'identité (fond seul), `only` avec elles seules (à poser sur une cam ou un gameplay).
 * @param {SceneDoc} scene
 * @param {'on' | 'off' | 'only'} mode
 * @returns {SceneDoc}
 */
export function sceneForBrandingMode(scene, mode) {
  if (mode === 'on') return scene;
  return { ...scene, layers: scene.layers.filter(({ kind }) => isIdentityKind(kind) === (mode === 'only')) };
}

/**
 * Inverse de `sceneFromCurrent` : la forme historique d'une scène, ou `null` si elle n'y tient pas (plusieurs effets,
 * plusieurs brandings, couche déplacée, masquée ou atténuée) — plutôt qu'une couche choisie au hasard ou une
 * propriété perdue en silence. `showBranding` ne s'écrit que s'il est faux : absent signifie affiché.
 * @param {SceneDoc} scene
 * @returns {{ component: string | null, options: Record<string, unknown>, transition?: import('./background-transition.js').BackgroundTransition, showBranding?: false } | null}
 */
export function currentFromScene(scene) {
  const effects = scene.layers.filter(({ kind }) => !isIdentityKind(kind));
  const identities = scene.layers.filter(({ kind }) => isIdentityKind(kind));
  // Une timeline de scène n'a pas de forme historique : la perdre en silence changerait l'animation à l'antenne.
  if (scene.timeline !== undefined) return null;
  if (effects.length > 1 || identities.length > 1) return null;
  if (![...effects, ...identities].every(isPlainLayer)) return null;
  if (identities.length === 1 && (identities[0].kind !== 'branding' || Object.keys(identities[0].options).length > 0)) return null;

  const [effect] = effects;
  /** @type {NonNullable<ReturnType<typeof currentFromScene>>} */
  const current = { component: effect === undefined ? null : effect.kind, options: effect === undefined ? {} : effect.options };
  if (scene.transition !== undefined) current.transition = scene.transition;
  if (identities.length === 0) current.showBranding = false;
  return current;
}

/**
 * Inverse de `sceneFromPreset`. Une scène qui n'est pas « un effet et son branding » n'est pas un preset : `null`.
 * @param {SceneDoc} scene
 * @returns {PresetLike | null}
 */
export function presetFromScene(scene) {
  const current = currentFromScene(scene);
  if (current === null || current.component === null) return null;
  /** @type {PresetLike} */
  const preset = { id: scene.id, name: scene.name, component: current.component, options: current.options };
  if (scene.tags !== undefined) preset.tags = scene.tags;
  if (current.transition !== undefined) preset.transition = current.transition;
  if (current.showBranding === false) preset.showBranding = false;
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
    ...(scene.timeline === undefined ? {} : { timeline: /** @type {*} */ (canonicalSceneTimeline(scene.timeline)) }),
    layers: /** @type {Layer[]} */ (scene.layers.map((layer) => {
      if (!isPlainObject(layer)) return layer;
      const kind = resolveKindId(layer.kind) ?? layer.kind;
      const options = isPlainObject(layer.options) ? clampOptions(kind, neutralizeOptions(layer.options)) : layer.options;
      const placement = isPlainObject(layer.placement) ? canonicalPlacement(layer.placement) : layer.placement;
      const opacity = isFraction(layer.opacity) ? clamp(layer.opacity, 0, 1) : layer.opacity;
      return canonicalLook(/** @type {Layer} */ ({ ...layer, kind, options, placement, opacity }));
    })),
  };
}

/**
 * Le rendu étendu ramené dans ses bornes ; une valeur neutre est retirée (absent = neutre), de sorte que deux scènes qui
 * se rendent pareil s'écrivent pareil. Une valeur d'un mauvais type reste telle quelle : c'est `validateSceneDoc` qui la refuse.
 * @param {Layer} layer
 * @returns {Layer}
 */
function canonicalLook(layer) {
  const { blend, rotation, crop, blur, bindings, timeline, ...rest } = layer;
  /** @type {Record<string, unknown>} */
  const look = {};
  if (blend !== 'normal' && blend !== undefined) look.blend = blend;
  if (rotation !== undefined) {
    const bounded = isFraction(rotation) ? clamp(rotation, LOOK_LIMITS.rotation.min, LOOK_LIMITS.rotation.max) : rotation;
    if (bounded !== 0) look.rotation = bounded;
  }
  if (blur !== undefined) {
    const bounded = isFraction(blur) ? clamp(blur, LOOK_LIMITS.blur.min, LOOK_LIMITS.blur.max) : blur;
    if (bounded !== 0) look.blur = bounded;
  }
  if (crop !== undefined) {
    const bounded = canonicalCrop(crop);
    if (bounded !== null) look.crop = bounded;
  }
  const canonical = canonicalBindings(bindings);
  if (canonical !== undefined) look.bindings = canonical;
  const tracks = canonicalTracks(timeline);
  if (tracks !== undefined) look.timeline = tracks;
  return /** @type {Layer} */ ({ ...rest, ...look });
}

/** @param {unknown} crop @returns {unknown} `null` quand aucun côté n'est rogné */
function canonicalCrop(crop) {
  if (!isPlainObject(crop) || CROP_SIDES.some((side) => crop[side] !== undefined && !isFraction(crop[side]))) return crop;
  const sides = Object.fromEntries(CROP_SIDES.map((side) => [side, clamp(/** @type {number} */ (crop[side] ?? 0), LOOK_LIMITS.crop.min, LOOK_LIMITS.crop.max)]));
  for (const [first, second] of [['top', 'bottom'], ['left', 'right']]) {
    const sum = sides[first] + sides[second];
    if (sum > LOOK_LIMITS.cropPair) {
      sides[first] *= LOOK_LIMITS.cropPair / sum;
      sides[second] *= LOOK_LIMITS.cropPair / sum;
    }
  }
  return CROP_SIDES.every((side) => sides[side] === 0) ? null : sides;
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
 * @param {{ allowEmpty?: boolean }} [options] `allowEmpty` : la scène en antenne peut n'avoir aucune couche (ni fond ni branding)
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateSceneDoc(raw, { allowEmpty = false } = {}) {
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
  errors.push(...validateTransition(raw.transition).errors);
  errors.push(...sceneTimelineErrors('timeline', raw.timeline));

  if (!Array.isArray(raw.layers)) {
    errors.push('layers : liste attendue');
    return { ok: false, errors };
  }
  if (raw.layers.length < 1 && !allowEmpty) errors.push('layers : au moins une couche');
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
    if (layer.locked !== undefined && typeof layer.locked !== 'boolean') errors.push(`${where}.locked : booléen attendu`);
    if (!isFraction(layer.opacity)) errors.push(`${where}.opacity : nombre attendu`);
    errors.push(...placementErrors(where, layer.placement));
    errors.push(...lookErrors(where, layer));
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

/** @param {string} where @param {Record<string, unknown>} layer @returns {string[]} */
function lookErrors(where, layer) {
  /** @type {string[]} */
  const errors = [];
  if (layer.blend !== undefined && !BLEND_MODES.some(({ id }) => id === layer.blend)) errors.push(`${where}.blend : mode de fusion inconnu`);
  if (layer.rotation !== undefined && !isFraction(layer.rotation)) errors.push(`${where}.rotation : nombre attendu`);
  if (layer.blur !== undefined && !isFraction(layer.blur)) errors.push(`${where}.blur : nombre attendu`);
  errors.push(...bindingErrors(`${where}.bindings`, layer.bindings));
  errors.push(...trackErrors(`${where}.timeline`, layer.timeline));
  if (layer.crop === undefined) return errors;
  const { crop } = layer;
  if (!isPlainObject(crop)) return [...errors, `${where}.crop : objet attendu`];
  for (const side of CROP_SIDES) {
    if (crop[side] !== undefined && !isFraction(crop[side])) errors.push(`${where}.crop.${side} : nombre attendu`);
  }
  if (errors.length === 0) {
    const side = (/** @type {string} */ key) => /** @type {number} */ (crop[key] ?? 0);
    if (side('top') + side('bottom') >= 1 || side('left') + side('right') >= 1) errors.push(`${where}.crop : deux côtés opposés ne peuvent pas tout rogner`);
  }
  return errors;
}

// ── Chemins adressables ──────────────────────────────────────────────────────

const LAYER_SCALARS = new Set(['name', 'visible', 'locked', 'opacity', 'blend', 'rotation', 'blur']);
const PLACEMENT_KEYS = new Set(['x', 'y', 'width', 'height']);

/**
 * Chemin vers une propriété modifiable : `name`, `layers[<id>].visible`,
 * `layers[<id>].opacity`, `layers[<id>].name`, `layers[<id>].blend|rotation|blur`, `layers[<id>].crop.<top|right|bottom|left>`,
 * `layers[<id>].placement.<x|y|width|height>` ou `layers[<id>].options.<clé>`. L'identité (`id`, `kind`) et l'ordre sont structurels : pas de chemin.
 * @param {string} path
 * @returns {{ layerId: string | null, field: 'scene' | 'layer' | 'placement' | 'crop' | 'options', key: string } | null}
 */
function parsePath(path) {
  if (path === 'name') return { layerId: null, field: 'scene', key: path };
  const match = /^layers\[([^\].]+)\]\.(.+)$/.exec(path);
  if (match === null) return null;
  const [, layerId, rest] = match;
  const parts = rest.split('.');
  if (parts.length === 1 && LAYER_SCALARS.has(parts[0])) return { layerId, field: 'layer', key: parts[0] };
  if (parts.length === 2 && parts[0] === 'placement' && PLACEMENT_KEYS.has(parts[1])) {
    return { layerId, field: 'placement', key: parts[1] };
  }
  if (parts.length === 2 && parts[0] === 'crop' && /** @type {readonly string[]} */ (CROP_SIDES).includes(parts[1])) {
    return { layerId, field: 'crop', key: parts[1] };
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
  const holder = target.field === 'layer' ? layer : layer[/** @type {'placement' | 'crop' | 'options'} */ (target.field)];
  return { ok: true, value: /** @type {Record<string, unknown> | undefined} */ (holder)?.[target.key] };
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
        const field = /** @type {'placement' | 'crop' | 'options'} */ (target.field);
        return { ...layer, [field]: { ...layer[field], [target.key]: value } };
      }),
    },
  };
}
