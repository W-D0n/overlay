// @ts-check
/**
 * dev/preset-draft-sync.js — Brouillons de presets côté Studio : ce que le serveur garde, et l'envoi des réglages.
 *
 * Chaque réglage fait sur un preset enregistré est rangé sur le serveur, après un court délai, sous l'identifiant de
 * ce preset (`docs/specs/scene-doc-etape-5.md`, 5b-2). L'état à envoyer est capturé au moment du réglage, pas à
 * l'échéance : passer à un autre preset dans l'intervalle n'envoie ni le mauvais état ni rien. Un réglage sur un preset
 * différent du précédent envoie tout de suite le précédent.
 *
 * Un serveur sans la route des brouillons (ancien code) est signalé une fois à la lecture, et rien n'est envoyé ensuite :
 * jamais d'échec silencieux répété à chaque réglage.
 *
 * @typedef {import('./background-state-format.js').BackgroundCurrent} BackgroundCurrent
 * @typedef {{ at: string, state: BackgroundCurrent }} DraftEntry
 * @typedef {{ presetId: string, state: BackgroundCurrent }} PendingDraft
 */

const DEFAULT_DELAY_MS = 600;

/**
 * @param {{
 *   client: {
 *     readDrafts(): Promise<Record<string, DraftEntry>>,
 *     saveDraft(presetId: string, state: BackgroundCurrent): Promise<*>,
 *     discardDraft(presetId: string): Promise<*>,
 *   },
 *   snapshot: () => { current: { component: string | null, options: Record<string, unknown> }, activePresetId: string | null, transition: *, showBranding: boolean },
 *   onChange?: () => void,
 *   onError?: (message: string) => void,
 *   now?: () => string,
 *   delayMs?: number,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 * }} input
 */
export function createPresetDraftSync(input) {
  const setTimer = input.setTimeoutImpl ?? setTimeout;
  const clearTimer = input.clearTimeoutImpl ?? clearTimeout;
  const now = input.now ?? (() => new Date().toISOString());
  const delayMs = input.delayMs ?? DEFAULT_DELAY_MS;
  const notify = () => input.onChange?.();
  const fail = (/** @type {string} */ message) => input.onError?.(message);

  /** @type {Map<string, DraftEntry>} */
  const drafts = new Map();
  let available = true;
  /** @type {PendingDraft | null} */
  let pending = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function clearTimerIfAny() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  /** @param {PendingDraft} draft */
  async function send(draft) {
    if (!available) return;
    drafts.set(draft.presetId, { at: now(), state: draft.state });
    notify();
    try {
      await input.client.saveDraft(draft.presetId, draft.state);
    } catch (error) {
      fail(`brouillon non enregistré : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    has: (/** @type {string} */ presetId) => drafts.has(presetId),
    get: (/** @type {string} */ presetId) => drafts.get(presetId)?.state ?? null,

    /** Relit les brouillons du serveur. @returns {Promise<void>} */
    async load() {
      try {
        const all = await input.client.readDrafts();
        drafts.clear();
        for (const [presetId, entry] of Object.entries(all)) drafts.set(presetId, entry);
        available = true;
      } catch {
        available = false;
        fail('Brouillons indisponibles : serveur injoignable ou trop ancien (redémarrez-le).');
      }
      notify();
    },

    /**
     * À appeler après chaque réglage : capture l'état du preset actif et l'envoie après le délai. Sans preset actif
     * (réglage libre, « Créer »), il n'y a pas de brouillon.
     */
    schedule() {
      const { current, activePresetId, transition, showBranding } = input.snapshot();
      if (activePresetId === null || current.component === null) return;
      if (pending !== null && pending.presetId !== activePresetId) {
        clearTimerIfAny();
        const previous = pending;
        pending = null;
        send(previous);
      }
      pending = {
        presetId: activePresetId,
        state: { component: current.component, options: { ...current.options }, transition: { ...transition }, showBranding },
      };
      clearTimerIfAny();
      timer = setTimer(() => { timer = null; this.flush(); }, delayMs);
    },

    /** Envoie sans attendre le délai ce qui est en attente. */
    flush() {
      clearTimerIfAny();
      const draft = pending;
      pending = null;
      return draft === null ? Promise.resolve() : send(draft);
    },

    /**
     * Le preset vient d'être enregistré ou supprimé : le serveur a retiré son brouillon, ce qui était en attente ne
     * doit pas le recréer.
     * @param {string} presetId
     */
    forget(presetId) {
      if (pending?.presetId === presetId) {
        clearTimerIfAny();
        pending = null;
      }
      if (drafts.delete(presetId)) notify();
    },

    /**
     * Abandonne le brouillon d'un preset (« Revenir à la version enregistrée »).
     * @param {string} presetId
     */
    async discard(presetId) {
      this.forget(presetId);
      try {
        await input.client.discardDraft(presetId);
      } catch (error) {
        fail(`brouillon non abandonné : ${error instanceof Error ? error.message : String(error)}`);
        await this.load();
      }
    },
  };
}
