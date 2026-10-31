// @ts-check
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { newTwitchatToken, normalizeConnectionFile, withTwitchatToken } from './connection-settings.js';

/**
 * dev/connection-store.js — Le fichier des réglages de connexion (mot de passe OBS…), à côté du fichier d'état.
 *
 * Écrit en entier ou pas du tout (fichier temporaire renommé), écritures sérialisées ; un fichier illisible n'est jamais écrasé en
 * silence (le Studio le dit, l'owner le corrige ou le supprime). Le dossier `dev/data` n'est jamais servi (`local-access-policy.js`)
 * et n'est pas versionné. Le mode `0o600` restreint le fichier à son propriétaire là où le système le permet.
 */

/**
 * @param {{ path: string }} options
 */
export function createConnectionStore({ path }) {
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serialized(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /** @returns {Promise<import('./connection-settings.js').ConnectionFile>} */
  async function read() {
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (/** @type {{ code?: string }} */ (error).code === 'ENOENT') return normalizeConnectionFile({});
      throw error;
    }
    try {
      return normalizeConnectionFile(JSON.parse(text));
    } catch {
      throw new Error(`fichier des connexions illisible (${path}) : corrigez ou supprimez ce fichier`);
    }
  }

  /** @param {import('./connection-settings.js').ConnectionFile} file */
  async function write(file) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  }

  /**
   * Lit, transforme, écrit : une seule opération à la fois. Une transformation qui rend le fichier reçu tel quel n'écrit rien.
   * @param {(file: import('./connection-settings.js').ConnectionFile) => import('./connection-settings.js').ConnectionFile} change
   * @returns {Promise<import('./connection-settings.js').ConnectionFile>}
   */
  function update(change) {
    return serialized(async () => {
      const current = await read();
      const next = change(current);
      if (next !== current) await write(next);
      return next;
    });
  }

  return {
    read: () => serialized(read),
    update,

    /** Le jeton de Twitchat, créé au premier besoin et gardé ensuite. @returns {Promise<string>} */
    async twitchatToken() {
      const file = await update((current) => (current.twitchat.token === undefined ? withTwitchatToken(current, newTwitchatToken()) : current));
      return file.twitchat.token ?? '';
    },

    /** Un jeton neuf : l'ancien ne vaut plus rien. @returns {Promise<string>} */
    async regenerateTwitchatToken() {
      const file = await update((current) => withTwitchatToken(current, newTwitchatToken()));
      return file.twitchat.token ?? '';
    },
  };
}
