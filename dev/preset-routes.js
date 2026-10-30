// @ts-check
/**
 * dev/preset-routes.js — Routes des presets : enregistrer, renommer, dupliquer, supprimer, prévisualiser et importer.
 *
 * Chaque route lit le fichier d'état par `inspect`, le modifie par `update` (l'un et l'autre sérialisés par le magasin)
 * et signale la mutation réussie par `announce`. Aucun accès au disque ni au réseau ici. Le fichier est un ensemble de
 * scènes ; les corps de requête sont en forme plate (`dev/state-wire.js`), comme les lots d'import.
 *
 * Routes :
 *   POST /save-preset      — `{ id?, name, component, options, tags?, transition?, showBranding? }` ou `{ id?, scene }`
 *                            (scène complète, nommée par `scene.name`), crée ou met à jour (la mise à jour retire le
 *                            brouillon du preset).
 *   POST /rename-preset    — `{ id, name }`, renomme sans casser l'URL OBS.
 *   POST /duplicate-preset — `{ id }`, crée une copie autonome.
 *   POST /preview-import   — `{ bundle }`, calcule le plan et la révision sans écrire.
 *   POST /import-presets   — `{ bundle, expectedRevision }`, fusionne si la révision est inchangée.
 *   POST /delete-preset    — `{ id }`, supprime (404 si absent) avec son brouillon.
 */
import {
  createPresetId,
  validatePresetName,
  upsertScene,
  renameScene,
  duplicateScene,
  removeScene,
} from './background-state-format.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { withDrafts, withoutDraft } from './preset-drafts.js';
import {
  backgroundPresetRevision,
  mergeBackgroundPresetImport,
  parseBackgroundPresetBundle,
} from './background-preset-library.js';
import { sceneFromPreset } from '../scene-doc.js';
import { namedSceneFromWire, sceneFromWirePreset, wirePreset } from './state-wire.js';

/**
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {'saved' | 'renamed' | 'duplicated' | 'imported' | 'deleted'} PresetAction
 * @typedef {{
 *   update: (decide: (file: BackgroundFile) => Response | BackgroundFile) => Promise<Response>,
 *   inspect: (view: (file: BackgroundFile) => Response) => Promise<Response>,
 *   announce: (preset: { id: string, name: string }, action: PresetAction) => void,
 * }} PresetRouteDeps
 */

/**
 * La bibliothèque telle que la voit un lot d'import (forme plate) : les presets qui ont une forme plate, et les autres
 * scènes, que le lot ne sait pas représenter (plusieurs effets, couche déplacée…) et que l'import doit laisser intactes.
 * @param {BackgroundFile} file
 */
function flatLibrary(file) {
  /** @type {import('./background-state-format.js').BackgroundPreset[]} */
  const presets = [];
  /** @type {{ id: string, name: string }[]} */
  const reserved = [];
  for (const scene of file.scenes) {
    const preset = wirePreset(scene);
    if (preset === null) reserved.push({ id: scene.id, name: scene.name });
    else presets.push(preset);
  }
  return { presets, reserved };
}

/**
 * Un lot qui reprendrait l'identifiant d'une scène qu'il ne sait pas représenter l'écraserait en la tronquant : refus.
 * @param {BackgroundFile} file
 * @param {{ id: string }[]} imported
 * @returns {string | null} le message d'erreur, ou `null`
 */
function takenIds(file, imported) {
  const { reserved } = flatLibrary(file);
  const clash = imported.find(({ id }) => reserved.some((scene) => scene.id === id));
  return clash === undefined ? null : `l’identifiant ${clash.id} est celui d’une scène à plusieurs couches, que ce lot ne peut pas remplacer`;
}

/**
 * @param {PresetRouteDeps} deps
 * @returns {Record<string, (req: Request) => Promise<Response>>}
 */
export function createPresetRoutes({ update, inspect, announce }) {
  /**
   * POST /save-preset — sans `id`, crée un preset ; avec `id`, met à jour le preset existant.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handleSavePreset(req) {
    const body = /** @type {*} */ (await req.json());
    /** @type {import('../scene-doc.js').SceneDoc | null} */
    let saved = null;
    const response = await update((file) => {
      const requestedId = typeof body?.id === 'string' ? body.id : null;
      const existingScene = requestedId === null ? undefined : file.scenes.find(({ id }) => id === requestedId);
      if (requestedId !== null && existingScene === undefined) return jsonError(`preset inconnu : ${requestedId}`, 404);
      if (body?.scene !== undefined && ['name', 'component', 'options', 'tags', 'transition', 'showBranding'].some((key) => body?.[key] !== undefined)) {
        return jsonError('scène et forme plate : l’une ou l’autre', 400);
      }
      // Un preset sans forme plate (plusieurs effets, couche déplacée…) ne se met à jour que par sa scène complète.
      const existing = existingScene === undefined ? undefined : wirePreset(existingScene) ?? undefined;
      if (body?.scene === undefined && existingScene !== undefined && existing === undefined) {
        return jsonError(`preset ${existingScene.id} : scène à plusieurs couches, à enregistrer par sa scène complète`, 409);
      }

      const id = existingScene?.id ?? createPresetId(String(body?.scene?.name ?? body?.name ?? ''), file.scenes);
      const candidate = body?.scene !== undefined ? namedSceneFromWire(body.scene, id) : sceneFromWirePreset({
        id,
        name: body?.name,
        component: body?.component,
        options: body?.options,
        ...(body?.tags === undefined
          ? (existing?.tags === undefined ? {} : { tags: existing.tags })
          : { tags: body.tags }),
        // Même règle que les tags : ce que la requête ne dit pas, le preset existant le conserve.
        ...(body?.transition === undefined
          ? (existing?.transition === undefined ? {} : { transition: existing.transition })
          : { transition: body.transition }),
        ...(body?.showBranding === undefined
          ? (existing?.showBranding === undefined ? {} : { showBranding: existing.showBranding })
          : { showBranding: body.showBranding }),
      });
      if (!candidate.ok) return jsonError(candidate.errors.join(' ; '), 400);
      if (file.scenes.some((scene) => scene.name === candidate.scene.name && scene.id !== id)) {
        return jsonError(`preset en double : ${candidate.scene.name}`, 409);
      }
      saved = candidate.scene;
      return withDrafts({ ...file, scenes: upsertScene(file.scenes, candidate.scene) }, withoutDraft(file.drafts, id));
    });
    if (response.ok && saved !== null) announce(saved, 'saved');
    return response;
  }

  /**
   * POST /rename-preset — `{ id, name }`.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handleRenamePreset(req) {
    const body = /** @type {*} */ (await req.json());
    const { id, name } = body ?? {};
    if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);
    const validation = validatePresetName(name);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

    /** @type {{ id: string, name: string } | null} */
    let renamed = null;
    const response = await update((file) => {
      const scene = file.scenes.find((candidate) => candidate.id === id);
      if (scene === undefined) return jsonError(`preset inconnu : ${id}`, 404);
      if (file.scenes.some((candidate) => candidate.name === name && candidate.id !== id)) return jsonError(`preset en double : ${name}`, 409);
      renamed = { id, name };
      return { ...file, scenes: renameScene(file.scenes, id, name) };
    });
    if (response.ok && renamed !== null) announce(renamed, 'renamed');
    return response;
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handleDuplicatePreset(req) {
    const body = /** @type {*} */ (await req.json());
    const id = body?.id;
    if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

    /** @type {import('../scene-doc.js').SceneDoc | null} */
    let copy = null;
    const response = await update((file) => {
      copy = duplicateScene(file.scenes, id);
      if (copy === null) return jsonError(`preset inconnu : ${id}`, 404);
      return { ...file, scenes: [...file.scenes, copy] };
    });
    if (response.ok && copy !== null) announce(copy, 'duplicated');
    return response;
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handlePreviewImport(req) {
    const body = /** @type {*} */ (await req.json());
    const parsed = parseBackgroundPresetBundle(body?.bundle);
    if (!parsed.ok) return jsonError(parsed.errors.join(' ; '), 400);

    return inspect((file) => {
      const library = flatLibrary(file);
      const taken = takenIds(file, parsed.presets);
      if (taken !== null) return jsonError(taken, 409);
      const plan = mergeBackgroundPresetImport(library.presets, parsed.presets, library.reserved);
      return new Response(JSON.stringify({
        revision: backgroundPresetRevision(file.scenes),
        created: plan.created,
        updated: plan.updated,
        renamed: plan.renamed,
        unchanged: plan.unchanged,
        changes: plan.changes,
      }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    });
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handleImportPresets(req) {
    const body = /** @type {*} */ (await req.json());
    const parsed = parseBackgroundPresetBundle(body?.bundle);
    if (!parsed.ok) return jsonError(parsed.errors.join(' ; '), 400);
    if (typeof body?.expectedRevision !== 'string') return jsonError('révision de presets manquante', 400);

    /** @type {import('./background-state-format.js').BackgroundPreset[]} */
    let importedPresets = [];
    const response = await update((file) => {
      if (backgroundPresetRevision(file.scenes) !== body.expectedRevision) {
        return jsonError('bibliothèque modifiée depuis l’aperçu — recalcul nécessaire', 409);
      }
      const taken = takenIds(file, parsed.presets);
      if (taken !== null) return jsonError(taken, 409);
      const library = flatLibrary(file);
      const merged = mergeBackgroundPresetImport(library.presets, parsed.presets, library.reserved);
      const importedIds = new Set(parsed.presets.map(({ id }) => id));
      importedPresets = merged.presets.filter(({ id }) => importedIds.has(id));
      // Les scènes que le lot ne représente pas gardent leur place et leur contenu ; les autres suivent la fusion.
      const mergedById = new Map(merged.presets.map((preset) => [preset.id, preset]));
      const known = new Set(file.scenes.map(({ id }) => id));
      const scenes = [
        ...file.scenes.map((scene) => (mergedById.has(scene.id) ? sceneFromPreset(/** @type {*} */ (mergedById.get(scene.id))) : scene)),
        ...merged.presets.filter(({ id }) => !known.has(id)).map((preset) => sceneFromPreset(preset)),
      ];
      return { ...file, scenes };
    });
    if (response.ok) importedPresets.forEach((preset) => announce(preset, 'imported'));
    return response;
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handleDeletePreset(req) {
    const body = /** @type {*} */ (await req.json());
    const id = body?.id;
    if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

    /** @type {import('../scene-doc.js').SceneDoc | null} */
    let deleted = null;
    const response = await update((file) => {
      deleted = file.scenes.find((scene) => scene.id === id) ?? null;
      if (deleted === null) return jsonError(`preset inconnu : ${id}`, 404);
      return withDrafts({ ...file, scenes: removeScene(file.scenes, id) }, withoutDraft(file.drafts, id));
    });
    if (response.ok && deleted !== null) announce(deleted, 'deleted');
    return response;
  }

  return {
    '/save-preset': handleSavePreset,
    '/rename-preset': handleRenamePreset,
    '/duplicate-preset': handleDuplicatePreset,
    '/preview-import': handlePreviewImport,
    '/import-presets': handleImportPresets,
    '/delete-preset': handleDeletePreset,
  };
}
