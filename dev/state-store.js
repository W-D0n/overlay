// @ts-check
/**
 * dev/state-store.js — Magasin du fichier d'état : lecture, écriture, verrou, migration.
 *
 * Seul écrivain du fichier : toute modification passe par `transact`, qui sérialise lecture, transformation et
 * écriture (aucune course lecture-modification-écriture). Un fichier présent mais invalide n'est jamais réparé
 * silencieusement : l'appelant reçoit les erreurs. Un fichier d'une version plus ancienne est sauvegardé avant que
 * la version migrée ne soit écrite.
 *
 * Aucune dépendance HTTP : le résultat décrit ce qui s'est passé, l'appelant en tire sa réponse.
 *
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {{ ok: true, file: BackgroundFile } | { ok: false, errors: string[] }} StateRead
 */
import {
  BACKGROUND_FILE_VERSION,
  defaultBackgroundFile,
  encodePersistedFile,
  readBackgroundFile,
} from './background-state-format.js';
import { createKeyedLock } from './keyed-lock.js';

const LOCK_KEY = 'background-state';

/**
 * @param {{ path: string, log?: Pick<Console, 'info'> }} options
 */
export function createStateStore({ path, log = console }) {
  const lock = createKeyedLock();

  /**
   * Copie le fichier d'origine à côté de lui avant que la version migrée ne soit écrite. Une seule
   * sauvegarde : si elle existe déjà, elle est la plus ancienne et ne doit jamais être écrasée.
   * @param {Blob} file
   * @param {number} from version du fichier d'origine
   */
  async function backupBeforeMigration(file, from) {
    const backupPath = `${path}.pre-v${BACKGROUND_FILE_VERSION}.bak`;
    const backup = Bun.file(backupPath);
    if (await backup.exists()) return;
    await Bun.write(backupPath, await file.text());
    log.info(`[state-store] fichier d'état version ${from} migré en version ${BACKGROUND_FILE_VERSION} — original conservé : ${backupPath}`);
  }

  /**
   * Fichier absent → état par défaut ; présent mais invalide → erreurs.
   * @returns {Promise<StateRead>}
   */
  async function read() {
    const file = Bun.file(path);
    if (!(await file.exists())) return { ok: true, file: defaultBackgroundFile() };

    /** @type {unknown} */
    let raw;
    try {
      raw = await file.json();
    } catch (err) {
      return { ok: false, errors: [`JSON illisible : ${String(err)}`] };
    }

    const decoded = readBackgroundFile(raw);
    if (!decoded.ok) return { ok: false, errors: decoded.errors };
    if (decoded.migratedFrom !== null) await backupBeforeMigration(file, decoded.migratedFrom);
    return { ok: true, file: decoded.file };
  }

  /** @param {BackgroundFile} file */
  async function write(file) {
    await Bun.write(path, `${JSON.stringify(encodePersistedFile(file), null, 2)}\n`);
  }

  return {
    path,
    read,

    /**
     * Lecture + transformation + écriture sérialisées. `decide` reçoit le fichier courant et rend soit `{ file }`
     * (à persister, puis `afterWrite` s'il est fourni, toujours sous le verrou), soit `{ abort }` (rien n'est écrit,
     * la valeur est rendue telle quelle).
     * @template A
     * @param {(file: BackgroundFile) => { file: BackgroundFile, afterWrite?: () => void } | { abort: A }} decide
     * @returns {Promise<{ status: 'written' } | { status: 'aborted', abort: A } | { status: 'unreadable', errors: string[] }>}
     */
    transact(decide) {
      return lock(LOCK_KEY, async () => {
        const current = await read();
        if (!current.ok) return /** @type {const} */ ({ status: 'unreadable', errors: current.errors });
        const decision = decide(current.file);
        if ('abort' in decision) return /** @type {const} */ ({ status: 'aborted', abort: decision.abort });
        await write(decision.file);
        decision.afterWrite?.();
        return /** @type {const} */ ({ status: 'written' });
      });
    },

    /**
     * Lecture sérialisée avec les écritures : la valeur décrit un instant cohérent.
     * @template T
     * @param {(file: BackgroundFile) => T} view
     * @returns {Promise<{ status: 'read', value: T } | { status: 'unreadable', errors: string[] }>}
     */
    inspect(view) {
      return lock(LOCK_KEY, async () => {
        const current = await read();
        if (!current.ok) return /** @type {const} */ ({ status: 'unreadable', errors: current.errors });
        return /** @type {const} */ ({ status: 'read', value: view(current.file) });
      });
    },
  };
}
