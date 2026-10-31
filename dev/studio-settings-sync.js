// @ts-check
/**
 * dev/studio-settings-sync.js — Les réglages du Studio, du serveur au navigateur : chargement, enregistrement différé,
 * reprise de ce qui était gardé dans le navigateur, mises à jour venues d'un autre onglet ou d'une autre fenêtre.
 *
 * Le **serveur est la référence** : c'est lui qui suit l'utilisateur d'un client à l'autre (Chrome, application de bureau).
 * Le stockage du navigateur n'est qu'un **cache** : il sert quand le serveur est injoignable ou trop ancien, et il alimente
 * la **reprise** (si le serveur n'a encore aucun réglage et que le navigateur en a, ils sont envoyés une fois).
 *
 * Les changements sont rassemblés et envoyés après un court délai (un curseur ne fait pas cent requêtes). Un envoi qui
 * échoue est gardé et retenté ; l'état (`synced`, `saving`, `offline`) est lisible pour l'interface.
 *
 * @typedef {import('./studio-settings.js').StudioSettings} StudioSettings
 * @typedef {import('./studio-settings.js').StoredCommand} StoredCommand
 * @typedef {import('./studio-settings.js').StoredTemplate} StoredTemplate
 * @typedef {{ customCommands?: StoredCommand[], preferences?: Record<string, string | number | boolean | null>, templates?: StoredTemplate[] }} SettingsPatch
 * @typedef {'synced' | 'saving' | 'offline'} SyncStatus
 */
import { emptyStudioSettings, normalizeStudioSettings, validateStudioSettings } from './studio-settings.js';
import { errorMessage } from './error-message.js';

const CACHE_KEY = 'overlay.studio.settings-cache';
/** Clés d'avant la synchronisation : lues une fois pour la reprise, puis laissées intactes. */
const LEGACY_COMMANDS_KEY = 'overlay.studio.custom-commands';
const LEGACY_VIEW_AIDS_KEY = 'overlay.studio.view-aids';
const LEGACY_UNIT_KEY = 'overlay.studio.placement-unit';

/**
 * @param {{
 *   client: {
 *     readStudioSettings(): Promise<StudioSettings>,
 *     saveStudioSettings(patch: SettingsPatch): Promise<unknown>,
 *   },
 *   storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
 *   delayMs?: number,
 *   retryMs?: number,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 *   onError?: (message: string) => void,
 * }} input
 */
export function createStudioSettingsSync(input) {
  const setTimer = input.setTimeoutImpl ?? setTimeout;
  const clearTimer = input.clearTimeoutImpl ?? clearTimeout;
  const delayMs = input.delayMs ?? 350;
  const retryMs = input.retryMs ?? 5000;
  const storage = input.storage ?? null;

  /** @type {StudioSettings} */
  let settings = emptyStudioSettings();
  /** Ce qui n'est pas encore parti vers le serveur. @type {{ customCommands?: StoredCommand[], templates?: StoredTemplate[], preferences: Record<string, string | number | boolean | null> }} */
  let pending = { preferences: {} };
  /** @type {SyncStatus} */
  let status = 'synced';
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();

  const notify = () => { for (const listener of [...listeners]) listener(); };

  /** @param {string} key @returns {string | null} */
  function readStorage(key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function writeCache() {
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify(settings));
    } catch {
      // Cache impossible (plein, refusé) : le serveur reste la référence.
    }
  }

  /** @param {SyncStatus} next */
  function setStatus(next) {
    if (status === next) return;
    status = next;
    notify();
  }

  const hasPending = () => pending.customCommands !== undefined || pending.templates !== undefined || Object.keys(pending.preferences).length > 0;

  async function flush() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!hasPending()) return;
    const sending = pending;
    pending = { preferences: {} };
    setStatus('saving');
    try {
      await input.client.saveStudioSettings({
        ...(sending.customCommands === undefined ? {} : { customCommands: sending.customCommands }),
        ...(sending.templates === undefined ? {} : { templates: sending.templates }),
        ...(Object.keys(sending.preferences).length === 0 ? {} : { preferences: sending.preferences }),
      });
      setStatus(hasPending() ? 'saving' : 'synced');
    } catch (error) {
      // Rien n'est perdu : on remet ce qui n'est pas parti devant ce qui a été demandé depuis, et on retente plus tard.
      pending = {
        ...(sending.customCommands === undefined && pending.customCommands === undefined ? {} : { customCommands: pending.customCommands ?? sending.customCommands }),
        ...(sending.templates === undefined && pending.templates === undefined ? {} : { templates: pending.templates ?? sending.templates }),
        preferences: { ...sending.preferences, ...pending.preferences },
      };
      setStatus('offline');
      input.onError?.(`réglages du Studio non enregistrés sur le serveur : ${errorMessage(error)}`);
      timer = setTimer(() => { timer = null; flush(); }, retryMs);
    }
  }

  function schedule() {
    writeCache();
    notify();
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { timer = null; flush(); }, delayMs);
  }

  /**
   * Les réglages gardés dans le navigateur avant la synchronisation (ou, à défaut, le cache de la dernière lecture).
   * @returns {StudioSettings}
   */
  function legacySettings() {
    /** @type {StudioSettings} */
    const found = emptyStudioSettings();
    try {
      const commands = JSON.parse(readStorage(LEGACY_COMMANDS_KEY) ?? 'null');
      if (Array.isArray(commands)) found.customCommands = commands;
      const aids = JSON.parse(readStorage(LEGACY_VIEW_AIDS_KEY) ?? 'null');
      if (aids !== null && typeof aids === 'object') {
        for (const key of ['snap', 'grid', 'rulers', 'safe']) if (typeof aids[key] === 'boolean') found.preferences[`view.${key}`] = aids[key];
      }
      const unit = readStorage(LEGACY_UNIT_KEY);
      if (unit === 'pixel' || unit === 'percent') found.preferences['placement.unit'] = unit;
    } catch {
      // Contenu illisible : il est ignoré, jamais envoyé.
    }
    return validateStudioSettings(found).ok ? found : emptyStudioSettings();
  }

  /** @returns {StudioSettings | null} */
  function cached() {
    try {
      const parsed = JSON.parse(readStorage(CACHE_KEY) ?? 'null');
      return parsed !== null && validateStudioSettings(parsed).ok ? normalizeStudioSettings(parsed) : null;
    } catch {
      return null;
    }
  }

  const isEmpty = (/** @type {StudioSettings} */ value) => value.customCommands.length === 0 && value.templates.length === 0 && Object.keys(value.preferences).length === 0;

  return {
    /**
     * Lit le serveur. Sans réglage côté serveur, reprend ceux du navigateur (une fois) ; serveur injoignable ou trop
     * ancien : travaille sur le cache et reste « hors ligne ».
     * @returns {Promise<'server' | 'migrated' | 'cache'>}
     */
    async load() {
      try {
        const remote = normalizeStudioSettings(await input.client.readStudioSettings());
        if (isEmpty(remote)) {
          const local = cached() ?? legacySettings();
          if (!isEmpty(local)) {
            settings = local;
            pending = { customCommands: local.customCommands, preferences: { ...local.preferences } };
            writeCache();
            notify();
            await flush();
            return 'migrated';
          }
        }
        settings = remote;
        writeCache();
        setStatus('synced');
        notify();
        return 'server';
      } catch (error) {
        settings = cached() ?? legacySettings();
        setStatus('offline');
        notify();
        input.onError?.(`réglages du Studio : serveur injoignable ou trop ancien, valeurs du navigateur utilisées (${errorMessage(error)})`);
        return 'cache';
      }
    },

    /** @returns {StoredCommand[]} */
    getCommands: () => structuredClone(settings.customCommands),

    /** @param {StoredCommand[]} commands */
    setCommands(commands) {
      settings = { ...settings, customCommands: structuredClone(commands) };
      pending.customCommands = structuredClone(commands);
      schedule();
    },

    /** @returns {StoredTemplate[]} */
    getTemplates: () => structuredClone(settings.templates),

    /** @param {StoredTemplate[]} templates */
    setTemplates(templates) {
      settings = { ...settings, templates: structuredClone(templates) };
      pending.templates = structuredClone(templates);
      schedule();
    },

    /**
     * @template {string | number | boolean} T
     * @param {string} key
     * @param {T} fallback
     * @returns {T}
     */
    getPreference(key, fallback) {
      const value = settings.preferences[key];
      return typeof value === typeof fallback ? /** @type {T} */ (value) : fallback;
    },

    /** @param {string} key @param {string | number | boolean} value */
    setPreference(key, value) {
      if (settings.preferences[key] === value) return;
      settings = { ...settings, preferences: { ...settings.preferences, [key]: value } };
      pending.preferences[key] = value;
      schedule();
    },

    /**
     * Les réglages reçus du serveur (autre onglet, autre fenêtre) : ils remplacent les nôtres, sauf ce qui n'est pas encore parti.
     * @param {unknown} raw
     */
    applyRemote(raw) {
      if (!validateStudioSettings(raw).ok) return;
      const remote = normalizeStudioSettings(raw);
      const next = {
        customCommands: pending.customCommands ?? remote.customCommands,
        preferences: { ...remote.preferences, ...Object.fromEntries(Object.entries(pending.preferences).filter(([, value]) => value !== null)) },
        templates: pending.templates ?? remote.templates,
      };
      if (JSON.stringify(next) === JSON.stringify(settings)) return;
      settings = /** @type {StudioSettings} */ (next);
      writeCache();
      notify();
    },

    /** Envoie sans attendre le délai (avant de quitter la page). */
    flush,
    status: () => status,
    hasPending,
    /** @param {() => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
