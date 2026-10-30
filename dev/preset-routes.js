// @ts-check
/**
 * dev/preset-routes.js — Routes des presets : enregistrer, renommer, dupliquer, supprimer, prévisualiser et importer.
 *
 * Chaque route lit le fichier d'état par `inspect`, le modifie par `update` (l'un et l'autre sérialisés par le magasin)
 * et signale la mutation réussie par `announce`. Aucun accès au disque ni au réseau ici.
 *
 * Routes :
 *   POST /save-preset      — `{ id?, name, component, options, tags?, transition?, showBranding? }`, crée ou met à jour
 *                            (la mise à jour retire le brouillon du preset).
 *   POST /rename-preset    — `{ id, name }`, renomme sans casser l'URL OBS.
 *   POST /duplicate-preset — `{ id }`, crée une copie autonome.
 *   POST /preview-import   — `{ bundle }`, calcule le plan et la révision sans écrire.
 *   POST /import-presets   — `{ bundle, expectedRevision }`, fusionne si la révision est inchangée.
 *   POST /delete-preset    — `{ id }`, supprime (404 si absent) avec son brouillon.
 */
import {
  createPresetId,
  canonicalBackgroundPreset,
  validateBackgroundPreset,
  validatePresetName,
  upsertPreset,
  renamePreset,
  duplicatePreset,
  removePreset,
} from './background-state-format.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { withDrafts, withoutDraft } from './preset-drafts.js';
import {
  backgroundPresetRevision,
  mergeBackgroundPresetImport,
  parseBackgroundPresetBundle,
} from './background-preset-library.js';

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
    /** @type {import('./background-state-format.js').BackgroundPreset | null} */
    let savedPreset = null;
    const response = await update((file) => {
      const requestedId = typeof body?.id === 'string' ? body.id : null;
      const existing = requestedId === null ? undefined : file.presets.find(({ id }) => id === requestedId);
      if (requestedId !== null && existing === undefined) return jsonError(`preset inconnu : ${requestedId}`, 404);

      const id = existing?.id ?? createPresetId(String(body?.name ?? ''), file.presets);
      const candidate = canonicalBackgroundPreset({
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
      const validation = validateBackgroundPreset(candidate);
      if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
      if (file.presets.some((preset) => preset.name === candidate.name && preset.id !== id)) {
        return jsonError(`preset en double : ${candidate.name}`, 409);
      }
      savedPreset = /** @type {import('./background-state-format.js').BackgroundPreset} */ (candidate);
      return withDrafts({ ...file, presets: upsertPreset(file.presets, savedPreset) }, withoutDraft(file.drafts, id));
    });
    if (response.ok && savedPreset !== null) announce(savedPreset, 'saved');
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

    /** @type {import('./background-state-format.js').BackgroundPreset | null} */
    let renamed = null;
    const response = await update((file) => {
      const preset = file.presets.find((candidate) => candidate.id === id);
      if (preset === undefined) return jsonError(`preset inconnu : ${id}`, 404);
      if (file.presets.some((candidate) => candidate.name === name && candidate.id !== id)) return jsonError(`preset en double : ${name}`, 409);
      renamed = { ...preset, name };
      return { ...file, presets: renamePreset(file.presets, id, name) };
    });
    if (response.ok && renamed !== null) announce(renamed, 'renamed');
    return response;
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handleDuplicatePreset(req) {
    const body = /** @type {*} */ (await req.json());
    const id = body?.id;
    if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

    /** @type {import('./background-state-format.js').BackgroundPreset | null} */
    let copy = null;
    const response = await update((file) => {
      copy = duplicatePreset(file.presets, id);
      if (copy === null) return jsonError(`preset inconnu : ${id}`, 404);
      return { ...file, presets: [...file.presets, copy] };
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
      const plan = mergeBackgroundPresetImport(file.presets, parsed.presets);
      return new Response(JSON.stringify({
        revision: backgroundPresetRevision(file.presets),
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
      if (backgroundPresetRevision(file.presets) !== body.expectedRevision) {
        return jsonError('bibliothèque modifiée depuis l’aperçu — recalcul nécessaire', 409);
      }
      const merged = mergeBackgroundPresetImport(file.presets, parsed.presets);
      const importedIds = new Set(parsed.presets.map(({ id }) => id));
      importedPresets = merged.presets.filter(({ id }) => importedIds.has(id));
      return { ...file, presets: merged.presets };
    });
    if (response.ok) importedPresets.forEach((preset) => announce(preset, 'imported'));
    return response;
  }

  /** @param {Request} req @returns {Promise<Response>} */
  async function handleDeletePreset(req) {
    const body = /** @type {*} */ (await req.json());
    const id = body?.id;
    if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

    /** @type {import('./background-state-format.js').BackgroundPreset | null} */
    let deleted = null;
    const response = await update((file) => {
      deleted = file.presets.find((preset) => preset.id === id) ?? null;
      if (deleted === null) return jsonError(`preset inconnu : ${id}`, 404);
      return withDrafts({ ...file, presets: removePreset(file.presets, id) }, withoutDraft(file.drafts, id));
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
