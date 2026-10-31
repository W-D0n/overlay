// @ts-check
/**
 * dev/operation-steps.js — Les étapes « geste » d'une commande personnalisée : ce que l'utilisateur fait directement dans
 * les panneaux, l'inspecteur ou l'aperçu (régler une opacité, placer une couche, ajouter un effet…) devient une étape
 * rejouable, au même titre qu'une commande du registre.
 *
 * Une étape geste est `{ op, args, target?, kind? }`, indépendante des identifiants de couche : elle s'applique à **la
 * sélection au moment de l'exécution** (`target: 'selection'`), et les réglages d'effet ne touchent que les couches du même
 * type (`kind`). Trois temps, tous purs et testables sans navigateur :
 *
 * - **capter** : `operationToStep` traduit une opération de l'éditeur (`onOperation`) en étape, ou dit pourquoi elle ne se
 *   rejoue pas ; `mergeSteps` rassemble les réglages successifs d'une même chose (dix positions d'un curseur = une étape) ;
 * - **rejouer** : `applyStep` exécute l'étape sur l'éditeur ;
 * - **montrer et corriger** : `describeStep` la raconte en français, `stepFields` / `withStepValue` exposent ses valeurs à
 *   l'éditeur de commande, `stepErrors` la valide (à l'import comme à l'enregistrement).
 *
 * @typedef {{ op: string, args: Record<string, unknown>, target?: 'selection', kind?: string }} OperationStep
 * @typedef {{ op: string, ids: string[], args: Record<string, unknown>, before?: Record<string, Record<string, number>> }} EditorOperation
 * @typedef {{ key: string, label: string, type: 'percent' | 'number' | 'boolean' | 'text' | 'choice', value: number | boolean | string, choices?: readonly { id: string, label: string }[] }} StepField
 */

import { BLEND_MODES, CROP_LABELS, CROP_SIDES, LOOK_LIMITS } from '../scene-doc.js';
import { BINDING_SOURCES, BINDING_TARGETS, bindingErrors } from '../layer-bindings.js';

export const OPERATIONS = Object.freeze(['layer', 'placement', 'translate', 'options', 'addLayer', 'removeLayers', 'duplicateLayers', 'moveLayers', 'resetLayers', 'layerKind', 'sceneProps']);

const PLACEMENT_KEYS = ['x', 'y', 'width', 'height'];
const LAYER_KEYS = ['name', 'visible', 'locked', 'opacity', 'blend', 'rotation', 'crop', 'blur', 'bindings'];
const LAYER_LABELS = /** @type {Record<string, string>} */ ({ blend: 'Fusion', rotation: 'Rotation (°)', blur: 'Flou (px)' });
const MOVES = ['up', 'down', 'top', 'bottom'];
const PLACEMENT_LABELS = /** @type {Record<string, string>} */ ({ x: 'x', y: 'y', width: 'largeur', height: 'hauteur' });
const MAX_OPTION_KEYS = 40;
const EPSILON = 1e-9;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const percent = (/** @type {number} */ fraction) => `${Math.round(fraction * 1000) / 10} %`;
const signed = (/** @type {number} */ fraction) => `${fraction < 0 ? '−' : '+'}${percent(Math.abs(fraction))}`;

/** @param {unknown} step @returns {step is OperationStep} */
export const isOperationStep = (step) => isRecord(step) && typeof step.op === 'string';

// ── Capter ────────────────────────────────────────────────────────────────

/**
 * L'étape qui rejoue une opération de l'éditeur, ou la raison pour laquelle elle ne se rejoue pas.
 * @param {EditorOperation} operation
 * @param {{ kindOf(id: string): string | undefined }} context
 * @returns {{ step: OperationStep } | { skipped: string }}
 */
export function operationToStep(operation, { kindOf }) {
  const { op, args } = operation;
  switch (op) {
    case 'setLayers': return { step: { op: 'layer', args: { patch: structuredClone(args.patch) }, target: 'selection' } };
    case 'setPlacement': return { step: { op: 'placement', args: { patch: structuredClone(args.patch) }, target: 'selection' } };
    case 'setPlacements': return placementsStep(operation);
    case 'setOptions': {
      const kind = operation.ids[0] === undefined ? undefined : kindOf(operation.ids[0]);
      return kind === undefined ? { skipped: 'réglage d’une couche inconnue' } : { step: { op: 'options', args: { patch: structuredClone(args.patch) }, target: 'selection', kind } };
    }
    case 'addLayer': return { step: { op: 'addLayer', args: structuredClone(args) } };
    case 'removeLayers': return { step: { op: 'removeLayers', args: {}, target: 'selection' } };
    case 'duplicateLayers': return { step: { op: 'duplicateLayers', args: {}, target: 'selection' } };
    case 'moveLayers': return typeof args.where === 'string' && MOVES.includes(args.where)
      ? { step: { op: 'moveLayers', args: { where: args.where }, target: 'selection' } }
      : { skipped: 'déplacement à une position précise : il ne se rejoue pas d’une scène à l’autre' };
    case 'resetLayers': return { step: { op: 'resetLayers', args: {}, target: 'selection' } };
    case 'restoreVersion': return { skipped: 'restauration d’une version : elle ne se rejoue pas d’une scène à l’autre' };
    case 'setLayerKind': return { step: { op: 'layerKind', args: structuredClone(args), target: 'selection' } };
    case 'setSceneProps': return { step: { op: 'sceneProps', args: { patch: Object.fromEntries(Object.entries(/** @type {Record<string, unknown>} */ (args.patch)).map(([key, value]) => [key, value === undefined ? null : structuredClone(value)])) } } };
    default: return { skipped: `opération inconnue : ${op}` };
  }
}

/** @param {EditorOperation} operation @returns {{ step: OperationStep } | { skipped: string }} */
function placementsStep(operation) {
  const patches = /** @type {Record<string, Record<string, number>>} */ (operation.args.patches);
  const list = Object.values(patches);
  if (list.length === 0) return { skipped: 'aucun placement' };
  const first = list[0];
  if (list.every((patch) => PLACEMENT_KEYS.every((key) => patch[key] === first[key]))) {
    return { step: { op: 'placement', args: { patch: { ...first } }, target: 'selection' } };
  }
  // Un placement différent par couche : seul un déplacement identique pour toutes (un glisser de groupe) a un sens général.
  const before = operation.before ?? {};
  const deltas = Object.entries(patches).map(([id, patch]) => ({
    dx: isNumber(patch.x) && isNumber(before[id]?.x) ? patch.x - before[id].x : NaN,
    dy: isNumber(patch.y) && isNumber(before[id]?.y) ? patch.y - before[id].y : NaN,
    resizes: ['width', 'height'].some((key) => patch[key] !== undefined && patch[key] !== before[id]?.[key]),
  }));
  const reference = deltas[0];
  const sameMove = deltas.every((delta) => !delta.resizes && Math.abs(delta.dx - reference.dx) < EPSILON && Math.abs(delta.dy - reference.dy) < EPSILON);
  if (sameMove && Number.isFinite(reference.dx) && Number.isFinite(reference.dy)) {
    return { step: { op: 'translate', args: { dx: reference.dx, dy: reference.dy }, target: 'selection' } };
  }
  return { skipped: 'placement différent par couche (alignement, répartition) : utilisez la commande correspondante' };
}

/**
 * Rassemble une étape et la suivante quand elles règlent la même chose sur la même cible : le dernier réglage l'emporte.
 * @param {OperationStep} previous
 * @param {OperationStep} next
 * @returns {OperationStep | null} l'étape fusionnée, ou `null` si elles restent séparées
 */
export function mergeSteps(previous, next) {
  if (previous.op !== next.op || previous.target !== next.target || previous.kind !== next.kind) return null;
  if (previous.op === 'translate') {
    return { ...previous, args: { dx: Number(previous.args.dx) + Number(next.args.dx), dy: Number(previous.args.dy) + Number(next.args.dy) } };
  }
  if (['layer', 'placement', 'options', 'sceneProps'].includes(previous.op)) {
    const before = /** @type {Record<string, any>} */ (previous.args.patch);
    const after = /** @type {Record<string, any>} */ (next.args.patch);
    // Le rognage se règle côté par côté : deux réglages de côtés différents se complètent.
    const crop = previous.op === 'layer' && before.crop !== undefined && after.crop !== undefined ? { crop: { ...before.crop, ...after.crop } } : {};
    return { ...previous, args: { patch: { ...before, ...after, ...crop } } };
  }
  return null;
}

// ── Rejouer ───────────────────────────────────────────────────────────────

/**
 * Exécute une étape sur l'éditeur. Les couches visées sont celles qui sont sélectionnées *maintenant*.
 * @param {OperationStep} step
 * @param {import('./scene-editor.js').SceneEditor} editor
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function applyStep(step, editor) {
  const { selection, scene } = editor.state();
  const layers = scene.layers.filter((layer) => selection.includes(layer.id));
  /** @param {{ ok: boolean } & Record<string, *>} result */
  const settle = (result) => (result.ok ? { ok: /** @type {const} */ (true) } : { ok: /** @type {const} */ (false), message: String(result.message ?? 'refusé') });
  if (step.target === 'selection' && layers.length === 0) return { ok: false, message: 'aucune couche sélectionnée' };
  const patch = /** @type {Record<string, *>} */ (step.args.patch ?? {});
  switch (step.op) {
    case 'layer': return settle(editor.setLayers(layers.map(({ id }) => id), patch));
    case 'placement': return settle(editor.setPlacement(layers.map(({ id }) => id), patch));
    case 'translate': {
      const dx = Number(step.args.dx);
      const dy = Number(step.args.dy);
      /** @type {Record<string, { x: number, y: number }>} */
      const patches = {};
      for (const layer of layers) patches[layer.id] = { x: layer.placement.x + dx, y: layer.placement.y + dy };
      return settle(editor.setPlacements(patches));
    }
    case 'options': {
      const targets = layers.filter((layer) => layer.kind === step.kind);
      if (targets.length === 0) return { ok: false, message: `aucune couche « ${step.kind} » sélectionnée` };
      let failure = '';
      editor.batch('Régler l’effet', () => {
        for (const layer of targets) {
          const result = editor.setOptions(layer.id, patch);
          if (!result.ok && failure === '') failure = result.message;
        }
      });
      return failure === '' ? { ok: true } : { ok: false, message: failure };
    }
    case 'addLayer': return settle(editor.addLayer(/** @type {Parameters<typeof editor.addLayer>[0]} */ (step.args)));
    case 'removeLayers': return settle(editor.removeLayers(layers.map(({ id }) => id)));
    case 'duplicateLayers': return settle(editor.duplicateLayers(layers.map(({ id }) => id)));
    case 'moveLayers': return settle(editor.moveLayers(layers.map(({ id }) => id), /** @type {'up' | 'down' | 'top' | 'bottom'} */ (step.args.where)));
    case 'resetLayers': return settle(editor.resetLayers(layers.map(({ id }) => id)));
    case 'layerKind': {
      let failure = '';
      editor.batch('Changer l’effet', () => {
        for (const layer of layers) {
          const result = editor.setLayerKind(layer.id, String(step.args.kind), /** @type {Record<string, unknown>} */ (step.args.options ?? {}));
          if (!result.ok && failure === '') failure = result.message;
        }
      });
      return failure === '' ? { ok: true } : { ok: false, message: failure };
    }
    case 'sceneProps': return settle(editor.setSceneProps(Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === null ? undefined : value]))));
    default: return { ok: false, message: `opération inconnue : ${step.op}` };
  }
}

// ── Montrer et corriger ───────────────────────────────────────────────────

/**
 * @param {OperationStep} step
 * @param {(kind: string) => string} [kindLabel]
 * @returns {string}
 */
export function describeStep(step, kindLabel = (kind) => kind) {
  const patch = /** @type {Record<string, *>} */ (step.args.patch ?? {});
  const parts = (/** @type {Record<string, *>} */ source, /** @type {(key: string, value: *) => string} */ show) => Object.entries(source).map(([key, value]) => show(key, value)).join(', ');
  switch (step.op) {
    case 'layer': return `Régler la sélection : ${parts(patch, (key, value) => {
      if (key === 'opacity') return `opacité ${percent(value)}`;
      if (key === 'visible') return value ? 'afficher' : 'masquer';
      if (key === 'locked') return value ? 'verrouiller' : 'déverrouiller';
      if (key === 'blend') return `fusion ${BLEND_MODES.find(({ id }) => id === value)?.label ?? value}`;
      if (key === 'rotation') return `rotation ${value}°`;
      if (key === 'blur') return `flou ${value} px`;
      if (key === 'bindings') return value.length === 0 ? 'aucune liaison' : `liaisons : ${value.map((/** @type {import('../layer-bindings.js').Binding} */ binding) => `${BINDING_SOURCES.find(({ id }) => id === binding.source)?.label ?? binding.source} → ${BINDING_TARGETS[binding.target]?.label ?? binding.target}`).join(', ')}`;
      if (key === 'crop') return `rognage ${CROP_SIDES.filter((side) => value[side]).map((side) => `${CROP_LABELS[side]} ${percent(value[side])}`).join(', ') || 'aucun'}`;
      return `nom « ${value} »`;
    })}`;
    case 'placement': return `Placer la sélection : ${parts(patch, (key, value) => `${PLACEMENT_LABELS[key] ?? key} ${percent(value)}`)}`;
    case 'translate': return `Déplacer la sélection de ${signed(Number(step.args.dx))} (horizontal), ${signed(Number(step.args.dy))} (vertical)`;
    case 'options': return `Régler l’effet « ${kindLabel(step.kind ?? '')} » : ${parts(patch, (key, value) => `${key} = ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)}`;
    case 'addLayer': return `Ajouter une couche « ${kindLabel(String(step.args.kind))} »`;
    case 'removeLayers': return 'Supprimer la sélection';
    case 'duplicateLayers': return 'Dupliquer la sélection';
    case 'moveLayers': return `Déplacer la sélection : ${{ up: 'd’un cran vers l’avant', down: 'd’un cran vers l’arrière', top: 'tout devant', bottom: 'tout derrière' }[/** @type {'up'} */ (step.args.where)] ?? String(step.args.where)}`;
    case 'resetLayers': return 'Réinitialiser la sélection (plein cadre, opaque, sans rendu étendu)';
    case 'layerKind': return `Changer l’effet de la sélection en « ${kindLabel(String(step.args.kind))} »`;
    case 'sceneProps': return `Régler la scène : ${parts(patch, (key, value) => `${key} = ${value === null ? 'retiré' : JSON.stringify(value)}`)}`;
    default: return step.op;
  }
}

/**
 * Les valeurs réglables d'une étape : de quoi les montrer dans l'éditeur de commande.
 * @param {OperationStep} step
 * @returns {StepField[]}
 */
export function stepFields(step) {
  /** @type {StepField[]} */
  const fields = [];
  if (step.op === 'translate') {
    fields.push({ key: 'dx', label: 'Horizontal', type: 'percent', value: Number(step.args.dx) }, { key: 'dy', label: 'Vertical', type: 'percent', value: Number(step.args.dy) });
    return fields;
  }
  const patch = /** @type {Record<string, unknown>} */ (step.args.patch ?? {});
  for (const [key, value] of Object.entries(patch)) {
    if (step.op === 'placement' && isNumber(value)) fields.push({ key, label: PLACEMENT_LABELS[key] ?? key, type: 'percent', value });
    else if (step.op === 'layer' && key === 'opacity' && isNumber(value)) fields.push({ key, label: 'Opacité', type: 'percent', value });
    else if (step.op === 'layer' && key === 'blend' && typeof value === 'string') fields.push({ key, label: LAYER_LABELS.blend, type: 'choice', value, choices: BLEND_MODES });
    else if (step.op === 'layer' && key === 'crop' && isRecord(value)) for (const side of CROP_SIDES) fields.push({ key: `crop.${side}`, label: `Rognage ${CROP_LABELS[side]}`, type: 'percent', value: isNumber(value[side]) ? value[side] : 0 });
    else if (typeof value === 'boolean') fields.push({ key, label: key === 'visible' ? 'Visible' : key === 'locked' ? 'Verrouillée' : key, type: 'boolean', value });
    else if (isNumber(value)) fields.push({ key, label: LAYER_LABELS[key] ?? key, type: 'number', value });
    else if (typeof value === 'string') fields.push({ key, label: key === 'name' ? 'Nom' : key, type: 'text', value });
  }
  return fields;
}

/**
 * La même étape, une valeur changée (rien n'est modifié sur place).
 * @param {OperationStep} step
 * @param {string} key
 * @param {number | boolean | string} value
 * @returns {OperationStep}
 */
export function withStepValue(step, key, value) {
  if (step.op === 'translate') return { ...step, args: { ...step.args, [key]: value } };
  if (key.startsWith('crop.')) {
    const patch = /** @type {Record<string, any>} */ (step.args.patch ?? {});
    return { ...step, args: { ...step.args, patch: { ...patch, crop: { ...patch.crop, [key.slice(5)]: value } } } };
  }
  return { ...step, args: { ...step.args, patch: { .../** @type {Record<string, unknown>} */ (step.args.patch ?? {}), [key]: value } } };
}

// ── Valider ───────────────────────────────────────────────────────────────

/**
 * @param {Record<string, unknown>} patch
 * @param {(key: string, value: unknown) => string | null} check
 * @returns {string[]}
 */
function patchErrors(patch, check) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return ['aucun réglage'];
  if (keys.length > MAX_OPTION_KEYS) return [`${MAX_OPTION_KEYS} réglages au plus`];
  return keys.flatMap((key) => {
    const problem = check(key, patch[key]);
    return problem === null ? [] : [problem];
  });
}

/**
 * Les défauts d'une étape geste (liste vide = valide).
 * @param {unknown} step
 * @returns {string[]}
 */
export function stepErrors(step) {
  if (!isRecord(step) || typeof step.op !== 'string') return ['étape : opération attendue'];
  if (!OPERATIONS.includes(step.op)) return [`opération inconnue : ${step.op}`];
  if (!isRecord(step.args)) return [`${step.op} : arguments attendus`];
  if (step.target !== undefined && step.target !== 'selection') return [`${step.op} : cible inconnue`];
  const args = step.args;
  const patch = isRecord(args.patch) ? args.patch : null;
  switch (step.op) {
    case 'layer': return patch === null ? ['layer : réglages attendus'] : patchErrors(patch, (key, value) => {
      if (!LAYER_KEYS.includes(key)) return `propriété de couche inconnue : ${key}`;
      if (key === 'opacity') return isNumber(value) && value >= 0 && value <= 1 ? null : 'opacité : nombre entre 0 et 1 attendu';
      if (key === 'name') return typeof value === 'string' && value.length <= 80 ? null : 'nom : texte attendu';
      if (key === 'blend') return BLEND_MODES.some(({ id }) => id === value) ? null : 'fusion : mode connu attendu';
      if (key === 'rotation') return isNumber(value) && value >= LOOK_LIMITS.rotation.min && value <= LOOK_LIMITS.rotation.max ? null : 'rotation : angle entre -180 et 180 attendu';
      if (key === 'blur') return isNumber(value) && value >= LOOK_LIMITS.blur.min && value <= LOOK_LIMITS.blur.max ? null : `flou : nombre entre 0 et ${LOOK_LIMITS.blur.max} attendu`;
      if (key === 'bindings') { const problems = bindingErrors('liaisons', value); return problems.length === 0 ? null : problems[0]; }
      if (key === 'crop') return isRecord(value) && Object.entries(value).every(([side, amount]) => CROP_SIDES.includes(/** @type {*} */ (side)) && isNumber(amount) && amount >= LOOK_LIMITS.crop.min && amount <= LOOK_LIMITS.crop.max) ? null : 'rognage : parts entre 0 et 0,9 attendues';
      return typeof value === 'boolean' ? null : `${key} : booléen attendu`;
    });
    case 'placement': return patch === null ? ['placement : réglages attendus'] : patchErrors(patch, (key, value) => {
      if (!PLACEMENT_KEYS.includes(key)) return `clé de placement inconnue : ${key}`;
      return isNumber(value) && value >= -1 && value <= 2 ? null : `${key} : fraction du canvas attendue`;
    });
    case 'translate': return isNumber(args.dx) && isNumber(args.dy) && Math.abs(args.dx) <= 2 && Math.abs(args.dy) <= 2 ? [] : ['déplacement : deux fractions attendues'];
    case 'options': return [
      ...(step.kind === undefined || typeof step.kind !== 'string' ? ['options : type d’effet attendu'] : []),
      ...(patch === null ? ['options : réglages attendus'] : patchErrors(patch, () => null)),
    ];
    case 'addLayer': return typeof args.kind === 'string' && args.kind !== '' ? [] : ['ajout : type d’effet attendu'];
    case 'moveLayers': return typeof args.where === 'string' && MOVES.includes(args.where) ? [] : ['déplacement : position attendue'];
    case 'layerKind': return typeof args.kind === 'string' && args.kind !== '' ? [] : ['changement d’effet : type attendu'];
    case 'sceneProps': return patch === null ? ['scène : réglages attendus'] : patchErrors(patch, () => null);
    default: return [];
  }
}
