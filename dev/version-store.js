// @ts-check
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateSceneDoc } from '../scene-doc.js';

/**
 * dev/version-store.js — Les versions nommées d'une scène : des points de restauration que l'utilisateur pose quand une scène lui plaît
 * (« avant le gros changement », « version stream du vendredi »), et qu'il retrouve plus tard, sur n'importe quelle scène, à n'importe quel moment.
 *
 * Elles sont distinctes de l'historique de publication (les scènes qui ont quitté l'antenne, automatiquement) : une version se **nomme**, se
 * garde tant qu'on ne la supprime pas, et se restaure dans le brouillon. Le magasin est un fichier JSON à côté du fichier d'état, écrit
 * en entier ou pas du tout (fichier temporaire renommé), écritures sérialisées ; un fichier illisible n'est jamais écrasé en silence. La scène
 * est validée comme une scène d'antenne : une version corrompue n'est jamais gardée à moitié.
 *
 * @typedef {{ id: string, key: string, name: string, at: string, scene: import('../scene-doc.js').SceneDoc }} StoredVersion
 */

/** Versions gardées par scène : au-delà, l'utilisateur en supprime d'abord (rien n'est jamais effacé à sa place). */
export const MAX_VERSIONS_PER_SCENE = 30;
export const MAX_VERSION_NAME = 60;
/** Poids maximal d'une scène gardée en version. */
export const MAX_VERSION_BYTES = 100_000;

/**
 * @param {{ path: string, now?: () => string, random?: () => string }} options
 */
export function createVersionStore({ path, now = () => new Date().toISOString(), random = () => Math.random().toString(36).slice(2, 8) }) {
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serialized(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /** @returns {Promise<StoredVersion[]>} */
  async function read() {
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (/** @type {{ code?: string }} */ (error).code === 'ENOENT') return [];
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`fichier des versions illisible (${path}) : corrigez ou supprimez ce fichier`);
    }
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.versions)) throw new Error(`fichier des versions invalide (${path}) : corrigez ou supprimez ce fichier`);
    return parsed.versions;
  }

  /** @param {StoredVersion[]} versions */
  async function write(versions) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ versions }, null, 2)}\n`);
    await rename(temporary, path);
  }

  /** @param {unknown} raw @returns {string | null} le nom nettoyé, ou `null` s'il est vide ou trop long */
  function cleanName(raw) {
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    return name === '' || name.length > MAX_VERSION_NAME ? null : name;
  }

  return {
    /**
     * Les versions, la plus récente d'abord ; celles d'une scène seulement si `key` est donné.
     * @param {string | null} [key]
     * @returns {Promise<StoredVersion[]>}
     */
    async list(key = null) {
      const all = await read();
      return all.filter((version) => key === null || version.key === key).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
    },

    /**
     * Garde la scène sous un nom.
     * @param {{ scene: unknown, name: unknown }} input
     * @returns {Promise<{ ok: true, version: StoredVersion } | { ok: false, error: string }>}
     */
    add({ scene, name }) {
      const clean = cleanName(name);
      if (clean === null) return Promise.resolve({ ok: false, error: `le nom est obligatoire (${MAX_VERSION_NAME} caractères au plus)` });
      const checked = validateSceneDoc(scene);
      if (!checked.ok) return Promise.resolve({ ok: false, error: `scène invalide : ${checked.errors.join(' ; ')}` });
      if (JSON.stringify(scene).length > MAX_VERSION_BYTES) return Promise.resolve({ ok: false, error: 'scène trop volumineuse pour être gardée en version' });
      const typed = /** @type {import('../scene-doc.js').SceneDoc} */ (scene);
      return serialized(async () => {
        const all = await read();
        const mine = all.filter((version) => version.key === typed.id);
        if (mine.length >= MAX_VERSIONS_PER_SCENE) return { ok: /** @type {const} */ (false), error: `${MAX_VERSIONS_PER_SCENE} versions au plus par scène : supprimez-en une d’abord` };
        if (mine.some((version) => version.name.toLowerCase() === clean.toLowerCase())) return { ok: /** @type {const} */ (false), error: `une version s’appelle déjà « ${clean} »` };
        /** @type {StoredVersion} */
        const version = { id: `v-${Date.now().toString(36)}-${random()}`, key: typed.id, name: clean, at: now(), scene: structuredClone(typed) };
        await write([...all, version]);
        return { ok: /** @type {const} */ (true), version };
      });
    },

    /**
     * @param {string} id
     * @param {unknown} name
     * @returns {Promise<{ ok: true, version: StoredVersion } | { ok: false, error: string, missing?: boolean }>}
     */
    rename(id, name) {
      const clean = cleanName(name);
      if (clean === null) return Promise.resolve({ ok: false, error: `le nom est obligatoire (${MAX_VERSION_NAME} caractères au plus)` });
      return serialized(async () => {
        const all = await read();
        const target = all.find((version) => version.id === id);
        if (target === undefined) return { ok: /** @type {const} */ (false), error: 'version introuvable', missing: true };
        if (all.some((version) => version.id !== id && version.key === target.key && version.name.toLowerCase() === clean.toLowerCase())) return { ok: /** @type {const} */ (false), error: `une version s’appelle déjà « ${clean} »` };
        const renamed = { ...target, name: clean };
        await write(all.map((version) => (version.id === id ? renamed : version)));
        return { ok: /** @type {const} */ (true), version: renamed };
      });
    },

    /** @param {string} id @returns {Promise<boolean>} vrai si elle existait */
    remove(id) {
      return serialized(async () => {
        const all = await read();
        if (!all.some((version) => version.id === id)) return false;
        await write(all.filter((version) => version.id !== id));
        return true;
      });
    },
  };
}
