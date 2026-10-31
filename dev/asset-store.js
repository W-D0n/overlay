// @ts-check
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSET_ID_PATTERN, ASSET_MIME, inspectAsset, sanitizeAssetName } from './asset-format.js';

/**
 * dev/asset-store.js — Le magasin d'assets d'image : des fichiers adressés par leur contenu dans un dossier, et un index lisible.
 *
 * L'identifiant d'un asset est le début de l'empreinte SHA-256 de ses octets : importer deux fois la même image donne le même
 * asset (aucun doublon), et le fichier servi ne change jamais pour un identifiant donné, ce qui permet de le mettre en cache
 * sans limite. Chaque écriture passe par un fichier temporaire renommé : un arrêt brutal ne laisse jamais un fichier ou un index
 * à moitié écrit. Les écritures sont sérialisées. Un index illisible n'est jamais écrasé en silence : l'appelant reçoit l'erreur.
 *
 * @typedef {import('./asset-format.js').AssetMeta} AssetMeta
 */

const INDEX_FILE = 'index.json';

/**
 * @param {{ dir: string, now?: () => string }} options
 */
export function createAssetStore({ dir, now = () => new Date().toISOString() }) {
  /** Les écritures se suivent : l'index est lu, modifié et réécrit sans qu'une autre s'intercale. @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serialized(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /** @returns {Promise<Record<string, AssetMeta>>} */
  async function readIndex() {
    let text;
    try {
      text = await readFile(join(dir, INDEX_FILE), 'utf8');
    } catch (error) {
      if (/** @type {{ code?: string }} */ (error).code === 'ENOENT') return {};
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`index des assets illisible (${join(dir, INDEX_FILE)}) : corrigez ou supprimez ce fichier`);
    }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.assets !== 'object' || parsed.assets === null) {
      throw new Error(`index des assets invalide (${join(dir, INDEX_FILE)}) : corrigez ou supprimez ce fichier`);
    }
    return parsed.assets;
  }

  /** Écrit un fichier entier ou rien : fichier temporaire, puis renommage. @param {string} name @param {string | Uint8Array} content */
  async function writeWhole(name, content) {
    const target = join(dir, name);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, target);
  }

  /** @param {Record<string, AssetMeta>} assets */
  const writeIndex = (assets) => writeWhole(INDEX_FILE, `${JSON.stringify({ assets }, null, 2)}\n`);

  /** @param {AssetMeta} meta */
  const fileOf = (meta) => join(dir, `${meta.id}.${meta.type}`);

  return {
    dir,

    /** Les assets, le plus récent d'abord. @returns {Promise<AssetMeta[]>} */
    async list() {
      return Object.values(await readIndex()).sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
    },

    /**
     * Range une image. Une image déjà connue est reconnue à son contenu et n'est pas dupliquée.
     * @param {Uint8Array} bytes
     * @param {unknown} name
     * @returns {Promise<{ ok: true, asset: AssetMeta, created: boolean } | { ok: false, error: string }>}
     */
    put(bytes, name) {
      const inspected = inspectAsset(bytes);
      if (!inspected.ok) return Promise.resolve(inspected);
      const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
      return serialized(async () => {
        await mkdir(dir, { recursive: true });
        const assets = await readIndex();
        const known = assets[id];
        if (known !== undefined) return { ok: /** @type {const} */ (true), asset: known, created: false };
        /** @type {AssetMeta} */
        const asset = { id, name: sanitizeAssetName(name), type: inspected.type, mime: ASSET_MIME[inspected.type], bytes: bytes.length, width: inspected.width, height: inspected.height, addedAt: now() };
        // Le fichier d'abord, l'index ensuite : un arrêt entre les deux laisse un fichier orphelin, jamais une entrée sans fichier.
        await writeWhole(`${id}.${asset.type}`, bytes);
        await writeIndex({ ...assets, [id]: asset });
        return { ok: /** @type {const} */ (true), asset, created: true };
      });
    },

    /**
     * Le contenu d'un asset, ou `null` s'il est inconnu (ou si son fichier a disparu).
     * @param {string} id
     * @returns {Promise<{ meta: AssetMeta, bytes: Uint8Array } | null>}
     */
    async read(id) {
      if (!ASSET_ID_PATTERN.test(id)) return null;
      const meta = (await readIndex())[id];
      if (meta === undefined) return null;
      try {
        return { meta, bytes: new Uint8Array(await readFile(fileOf(meta))) };
      } catch (error) {
        if (/** @type {{ code?: string }} */ (error).code === 'ENOENT') return null;
        throw error;
      }
    },

    /**
     * Retire un asset et son fichier. Vrai s'il existait.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    remove(id) {
      if (!ASSET_ID_PATTERN.test(id)) return Promise.resolve(false);
      return serialized(async () => {
        const assets = await readIndex();
        const meta = assets[id];
        if (meta === undefined) return false;
        const { [id]: _removed, ...rest } = assets;
        // L'index d'abord : un arrêt entre les deux laisse un fichier orphelin, jamais une entrée sans fichier.
        await writeIndex(rest);
        await rm(fileOf(meta), { force: true });
        return true;
      });
    },
  };
}
