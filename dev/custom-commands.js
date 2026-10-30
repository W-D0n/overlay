// @ts-check
/**
 * dev/custom-commands.js — Les commandes personnalisées : l'utilisateur compose une suite d'étapes (des commandes du
 * registre), lui donne un nom et, s'il veut, un raccourci ; elle s'exécute comme une commande ordinaire, en **un seul geste
 * annulable**. Logique pure et stockage : l'interface vit dans `custom-commands-controller.js`.
 *
 * Garde-fous : une étape est une commande qui existe et qui n'est ni personnalisée (pas de récursion), ni une fenêtre, ni
 * annuler / rétablir ; un raccourci porte Ctrl, Alt ou une touche de fonction (jamais une touche de saisie nue), ne
 * recouvre aucune commande existante et ne vise aucune combinaison réservée du navigateur.
 *
 * @typedef {{ id: string, name: string, steps: string[], shortcut?: string }} CustomCommand
 */

export const CUSTOM_PREFIX = 'custom.';
export const CUSTOM_GROUP = 'Personnalisées';
export const MAX_STEPS = 30;
export const NAME_MAX_LENGTH = 40;
const STORAGE_KEY = 'overlay.studio.custom-commands';

/** Combinaisons que le navigateur garde pour lui : les détourner serait inefficace ou dangereux. */
const RESERVED_SHORTCUTS = new Set([
  'Ctrl+T', 'Ctrl+N', 'Ctrl+W', 'Ctrl+R', 'Ctrl+L', 'Ctrl+P', 'Ctrl+S', 'Ctrl+O', 'Ctrl+F', 'Ctrl+H', 'Ctrl+J', 'Ctrl+U', 'Ctrl+Tab',
  'Ctrl+Maj+T', 'Ctrl+Maj+N', 'Ctrl+Maj+W', 'Ctrl+Maj+R', 'Ctrl+Maj+I', 'Ctrl+Maj+J', 'Ctrl+Maj+Delete', 'Alt+F4', 'F5', 'F11', 'F12',
  ...Array.from({ length: 9 }, (_, index) => `Ctrl+${index + 1}`),
]);

/** Ce qui n'a pas de sens dans une macro : annuler et rétablir (l'historique), les fenêtres, les commandes personnalisées elles-mêmes. */
const FORBIDDEN_STEPS = new Set(['edit.undo', 'edit.redo']);

/** @param {string} id */
export const isStepAllowed = (id) => !FORBIDDEN_STEPS.has(id) && !id.startsWith(CUSTOM_PREFIX) && !id.startsWith('help.') && !id.startsWith('commands.');

/**
 * Le raccourci écrit (« Ctrl+Maj+K ») correspondant à un événement clavier, ou `null` tant qu'il n'y a qu'un modificateur.
 * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }} event
 * @returns {string | null}
 */
export function shortcutFromEvent(event) {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(event.key)) return null;
  const names = /** @type {Record<string, string>} */ ({ ' ': 'Espace', Delete: 'Suppr', Enter: 'Entrée', Escape: 'Échap', Backspace: 'Retour' });
  const key = names[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Maj');
  parts.push(key);
  return parts.join('+');
}

/**
 * Vérifie un raccourci : forme, modificateur, combinaison réservée, conflit.
 * @param {string} shortcut
 * @param {{ taken?: ReadonlyMap<string, string> }} [context] raccourcis déjà pris, vers le libellé de leur commande
 * @returns {string | null} le message d'erreur, ou `null`
 */
export function checkShortcut(shortcut, { taken = new Map() } = {}) {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  if (key === '' || parts.length < 1) return 'raccourci vide';
  const modifiers = parts.slice(0, -1).map((modifier) => modifier.toLowerCase());
  if (modifiers.some((modifier) => !['ctrl', 'alt', 'maj'].includes(modifier))) return `raccourci invalide : ${shortcut}`;
  const functionKey = /^F([1-9]|1[0-2])$/i.test(key);
  if (!functionKey && !modifiers.includes('ctrl') && !modifiers.includes('alt')) return 'un raccourci doit comporter Ctrl ou Alt (ou être une touche de fonction), sinon il gênerait la saisie';
  if ([...RESERVED_SHORTCUTS].some((reserved) => reserved.toLowerCase() === shortcut.toLowerCase())) return `${shortcut} est réservé au navigateur`;
  const owner = [...taken].find(([other]) => other.toLowerCase() === shortcut.toLowerCase());
  if (owner !== undefined) return `${shortcut} est déjà pris par « ${owner[1]} »`;
  return null;
}

/**
 * @param {unknown} raw
 * @param {{
 *   knownIds: ReadonlySet<string>,
 *   taken?: ReadonlyMap<string, string>,
 *   others?: readonly CustomCommand[],
 * }} context `others` : les autres commandes personnalisées (pour l'unicité du nom) ; `taken` : les raccourcis des *autres* commandes
 * (celui de la commande validée n'en fait pas partie : la garder telle quelle n'est pas un conflit)
 * @returns {{ ok: true, command: CustomCommand } | { ok: false, errors: string[] }}
 */
export function validateCustomCommand(raw, { knownIds, taken = new Map(), others = [] }) {
  /** @type {string[]} */
  const errors = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['commande : objet attendu'] };
  const record = /** @type {Record<string, unknown>} */ (raw);
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (name === '') errors.push('le nom est obligatoire');
  else if (name.length > NAME_MAX_LENGTH) errors.push(`le nom dépasse ${NAME_MAX_LENGTH} caractères`);
  else if (others.some((other) => other.id !== record.id && other.name.toLowerCase() === name.toLowerCase())) errors.push(`une commande s'appelle déjà « ${name} »`);

  const steps = Array.isArray(record.steps) ? record.steps : [];
  if (!Array.isArray(record.steps) || steps.length === 0) errors.push('au moins une étape est nécessaire');
  if (steps.length > MAX_STEPS) errors.push(`${MAX_STEPS} étapes au plus`);
  for (const step of steps) {
    if (typeof step !== 'string' || !knownIds.has(step)) errors.push(`étape inconnue : ${String(step)}`);
    else if (!isStepAllowed(step)) errors.push(`étape non autorisée dans une commande : ${step}`);
  }

  /** @type {string | undefined} */
  let shortcut;
  if (record.shortcut !== undefined && record.shortcut !== '') {
    if (typeof record.shortcut !== 'string') errors.push('raccourci : texte attendu');
    else {
      const problem = checkShortcut(record.shortcut, { taken });
      if (problem !== null) errors.push(problem);
      else shortcut = record.shortcut;
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const id = typeof record.id === 'string' && record.id.startsWith(CUSTOM_PREFIX) ? record.id : `${CUSTOM_PREFIX}${slugify(name)}`;
  return { ok: true, command: { id, name, steps: /** @type {string[]} */ (steps), ...(shortcut === undefined ? {} : { shortcut }) } };
}

/** @param {string} name */
export function slugify(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'commande';
}

/**
 * Un identifiant libre pour une nouvelle commande personnalisée.
 * @param {string} name
 * @param {Iterable<string>} used
 */
export function uniqueCustomId(name, used) {
  const taken = new Set(used);
  const base = `${CUSTOM_PREFIX}${slugify(name)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * La commande exécutable d'une définition : ses étapes se jouent dans l'ordre, en un seul lot annulable. Une étape
 * indisponible à cet instant (par exemple « Aligner » sans sélection) est ignorée et signalée, les autres s'exécutent ; si
 * aucune ne l'est, la commande l'explique au lieu de ne rien faire. Elle reste donc toujours exécutable.
 * @param {CustomCommand} definition
 * @param {{
 *   registry: { run(id: string, options?: { silent?: boolean }): boolean, isEnabled(id: string): boolean, has(id: string): boolean },
 *   batch: <T>(label: string, run: () => T) => T,
 *   labelOf: (id: string) => string,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 * }} deps
 * @returns {import('./command-registry.js').Command}
 */
export function toCommand(definition, { registry, batch, labelOf, report }) {
  return {
    id: definition.id,
    label: definition.name,
    group: CUSTOM_GROUP,
    keywords: ['macro', 'personnalisée', ...definition.steps.map(labelOf)],
    ...(definition.shortcut === undefined ? {} : { shortcut: definition.shortcut }),
    run() {
      /** @type {string[]} */
      const skipped = [];
      let done = 0;
      batch(definition.name, () => {
        for (const step of definition.steps) {
          if (registry.run(step, { silent: true })) done += 1;
          else skipped.push(registry.has(step) ? labelOf(step) : `${step} (introuvable)`);
        }
      });
      if (done === 0) report.error(`« ${definition.name} » : aucune étape possible pour le moment — ${skipped.join(', ')} (sélectionnez une couche ?)`);
      else if (skipped.length > 0) report.error(`« ${definition.name} » : ${done} étape(s) faite(s), ${skipped.length} ignorée(s) — ${skipped.join(', ')}`);
      else report.ok(`« ${definition.name} » : ${done} étape(s)`);
    },
  };
}

/**
 * L'enregistreur de macro : écoute les commandes exécutées pendant qu'il est actif.
 * @param {{ onRun(listener: (id: string) => void): () => void }} registry
 */
export function createMacroRecorder(registry) {
  /** @type {(() => void) | null} */
  let stop = null;
  /** @type {string[]} */
  let recorded = [];
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) listener(); };

  return {
    isRecording: () => stop !== null,
    steps: () => [...recorded],
    /** @param {() => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (stop !== null) return;
      recorded = [];
      stop = registry.onRun((id) => {
        if (!isStepAllowed(id)) return;
        if (recorded.length < MAX_STEPS) recorded.push(id);
        notify();
      });
      notify();
    },
    /** Arrête l'enregistrement et rend les étapes. @returns {string[]} */
    finish() {
      stop?.();
      stop = null;
      const steps = [...recorded];
      notify();
      return steps;
    },
    cancel() {
      stop?.();
      stop = null;
      recorded = [];
      notify();
    },
  };
}

/**
 * Le stockage des commandes personnalisées (navigateur), avec repli en mémoire.
 * @param {{ storage?: Pick<Storage, 'getItem' | 'setItem'> | null }} [options]
 */
export function createCustomCommandStore({ storage = null } = {}) {
  /** @type {CustomCommand[] | null} */
  let memory = null;

  /** @returns {CustomCommand[]} */
  function read() {
    if (memory !== null) return memory;
    try {
      const text = storage?.getItem(STORAGE_KEY);
      const parsed = text === null || text === undefined ? [] : JSON.parse(text);
      memory = Array.isArray(parsed) ? parsed.filter(isShape) : [];
    } catch {
      memory = [];
    }
    return memory;
  }

  /** @param {CustomCommand[]} list */
  function write(list) {
    memory = list;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Stockage plein ou refusé : les commandes restent disponibles pour cette session.
    }
  }

  return {
    list: () => [...read()],
    /** Ajoute la commande, ou remplace celle de même identifiant. @param {CustomCommand} command */
    save(command) {
      const list = read();
      const index = list.findIndex((other) => other.id === command.id);
      write(index === -1 ? [...list, command] : list.map((other, position) => (position === index ? command : other)));
    },
    /** @param {string} id */
    remove(id) {
      write(read().filter((command) => command.id !== id));
    },
    /** @param {CustomCommand[]} list */
    replaceAll(list) {
      write([...list]);
    },
    /** Le JSON à copier ou à enregistrer. */
    exportJson: () => JSON.stringify({ format: 'overlay-custom-commands', version: 1, commands: read() }, null, 2),
  };
}

/** @param {unknown} value @returns {value is CustomCommand} */
function isShape(value) {
  return typeof value === 'object' && value !== null && typeof (/** @type {*} */ (value)).id === 'string'
    && typeof (/** @type {*} */ (value)).name === 'string' && Array.isArray((/** @type {*} */ (value)).steps);
}

/**
 * Lit un export JSON : rend les commandes valides et les raisons de refus des autres.
 * @param {string} text
 * @param {{ knownIds: ReadonlySet<string>, taken?: ReadonlyMap<string, string>, existing?: readonly CustomCommand[] }} context
 * @returns {{ ok: true, commands: CustomCommand[], rejected: { name: string, errors: string[] }[] } | { ok: false, error: string }}
 */
export function parseCustomCommands(text, { knownIds, taken = new Map(), existing = [] }) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON illisible' };
  }
  const list = Array.isArray(value) ? value : typeof value === 'object' && value !== null && /** @type {*} */ (value).format === 'overlay-custom-commands' ? /** @type {*} */ (value).commands : null;
  if (!Array.isArray(list)) return { ok: false, error: 'ce n’est pas un export de commandes personnalisées' };
  /** @type {CustomCommand[]} */
  const accepted = [];
  /** @type {{ name: string, errors: string[] }[]} */
  const rejected = [];
  const usedIds = new Set(existing.map(({ id }) => id));
  const usedShortcuts = new Map(taken);
  for (const raw of list) {
    // Une commande importée reçoit toujours un identifiant neuf : elle ne remplace jamais une commande existante en silence.
    const named = typeof raw === 'object' && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};
    const candidate = { ...named, id: undefined };
    const result = validateCustomCommand(candidate, { knownIds, taken: usedShortcuts, others: [...existing, ...accepted] });
    if (!result.ok) {
      rejected.push({ name: typeof named.name === 'string' ? named.name : '(sans nom)', errors: result.errors });
      continue;
    }
    const id = uniqueCustomId(result.command.name, usedIds);
    usedIds.add(id);
    const command = { ...result.command, id };
    accepted.push(command);
    if (command.shortcut !== undefined) usedShortcuts.set(command.shortcut, command.name);
  }
  return { ok: true, commands: accepted, rejected };
}
