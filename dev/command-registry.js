// @ts-check
/**
 * dev/command-registry.js — Le registre des commandes du Studio : une commande a un identifiant, un libellé, un groupe, des
 * mots-clés, éventuellement un raccourci, une condition d'activation et une action. La palette (Ctrl+K), l'aide des
 * raccourcis et le menu contextuel lisent ce registre : une fonction ajoutée ici est découvrable partout, sans code de plus.
 *
 * Logique pure : aucune dépendance au DOM.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   group: string,
 *   keywords?: string[],
 *   shortcut?: string,
 *   bind?: boolean,
 *   enabled?: () => boolean,
 *   run: () => void,
 * }} Command
 * @typedef {Omit<Command, 'enabled'> & { enabled: boolean }} ListedCommand
 */

/** Minuscules sans accents : la recherche ne distingue ni casse ni diacritiques. @param {unknown} value */
export function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** @type {Readonly<Record<string, string>>} */
const KEY_NAMES = Object.freeze({ suppr: 'delete', 'entrée': 'enter', entree: 'enter', 'échap': 'escape', echap: 'escape', espace: ' ', haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright' });

/**
 * Un raccourci écrit (« Ctrl+Maj+Z », « Suppr », « Ctrl+] ») correspond-il à cet événement clavier ? Ctrl et Cmd sont
 * équivalents ; les modificateurs doivent correspondre exactement (Ctrl+Z n'est pas Ctrl+Maj+Z).
 * @param {string} shortcut
 * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }} event
 * @returns {boolean}
 */
export function shortcutMatches(shortcut, event) {
  // La touche « + » s'écrit « + » ou « Ctrl++ » : un « + » final est la touche, pas un séparateur.
  const plusKey = shortcut.endsWith('+');
  const parts = (plusKey ? shortcut.slice(0, -1) : shortcut).split('+').map((part) => part.trim()).filter((part, index, all) => !(plusKey && part === '' && index === all.length - 1));
  const keyPart = plusKey ? '+' : /** @type {string} */ (parts.pop());
  const wanted = { ctrl: false, alt: false, shift: false };
  for (const part of parts) {
    const name = part.toLowerCase();
    if (name === 'ctrl' || name === 'cmd') wanted.ctrl = true;
    else if (name === 'alt') wanted.alt = true;
    else if (name === 'maj' || name === 'shift') wanted.shift = true;
    else return false;
  }
  if ((event.ctrlKey || event.metaKey) !== wanted.ctrl || event.altKey !== wanted.alt) return false;
  const lowered = keyPart.toLowerCase();
  const key = KEY_NAMES[lowered] ?? lowered;
  const typed = event.key.toLowerCase();
  // Un caractère qui s'obtient avec Maj (? + _) se compare tel quel : Maj ne fait pas partie du raccourci écrit.
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (!isSymbol && event.shiftKey !== wanted.shift) return false;
  return typed === key;
}

/**
 * Score d'une commande pour une requête : plus il est petit, meilleur est le résultat ; `null` : elle ne correspond pas.
 * Chaque mot de la requête doit se retrouver dans le libellé, le groupe ou les mots-clés ; un mot en début de libellé ou de mot
 * vaut mieux qu'un mot au milieu.
 * @param {{ label: string, group: string, keywords?: string[] }} command
 * @param {string} query
 * @returns {number | null}
 */
export function scoreCommand(command, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const label = fold(command.label);
  const haystack = [label, fold(command.group), ...(command.keywords ?? []).map(fold)].join(' ');
  let score = 0;
  for (const word of words) {
    if (!haystack.includes(word)) return null;
    if (label.startsWith(word)) score += 0;
    else if (label.split(/[\s'’-]+/).some((part) => part.startsWith(word))) score += 1;
    else if (label.includes(word)) score += 2;
    else score += 3;
  }
  return score + label.length / 1000;
}

export function createCommandRegistry() {
  /** @type {Map<string, Command>} */
  const commands = new Map();

  return {
    /** @param {Command} command */
    register(command) {
      if (commands.has(command.id)) throw new Error(`commande déjà enregistrée : ${command.id}`);
      commands.set(command.id, command);
    },

    /** @param {Command[]} list */
    registerAll(list) {
      for (const command of list) this.register(command);
    },

    /** @param {string} id */
    has: (id) => commands.has(id),

    /**
     * La commande liée au raccourci de cet événement (celles qui déclarent `bind: false` sont gérées ailleurs).
     * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }} event
     * @returns {Command | null}
     */
    forEvent(event) {
      for (const command of commands.values()) {
        if (command.shortcut !== undefined && command.bind !== false && shortcutMatches(command.shortcut, event)) return command;
      }
      return null;
    },

    /** @param {string} id @returns {boolean} la commande existe et est activée */
    isEnabled(id) {
      const command = commands.get(id);
      return command !== undefined && (command.enabled?.() ?? true);
    },

    /**
     * Exécute une commande activée.
     * @param {string} id
     * @returns {boolean} vrai si elle a été exécutée
     */
    run(id) {
      const command = commands.get(id);
      if (command === undefined || !(command.enabled?.() ?? true)) return false;
      command.run();
      return true;
    },

    /** Toutes les commandes avec leur état d'activation, dans l'ordre d'enregistrement. @returns {ListedCommand[]} */
    list() {
      return [...commands.values()].map((command) => ({ ...command, enabled: command.enabled?.() ?? true }));
    },

    /**
     * Les commandes qui correspondent à la requête, les meilleures d'abord ; les commandes désactivées passent après les
     * activées. Sans requête : toutes, regroupées dans l'ordre d'enregistrement.
     * @param {string} query
     * @returns {ListedCommand[]}
     */
    search(query) {
      const scored = this.list().map((command, index) => ({ command, index, score: scoreCommand(command, query) })).filter((entry) => entry.score !== null);
      scored.sort((a, b) => Number(!a.command.enabled) - Number(!b.command.enabled) || /** @type {number} */ (a.score) - /** @type {number} */ (b.score) || a.index - b.index);
      return scored.map((entry) => entry.command);
    },

    /** Les raccourcis déclarés, par groupe. @returns {{ group: string, items: { label: string, shortcut: string }[] }[]} */
    shortcuts() {
      /** @type {Map<string, { label: string, shortcut: string }[]>} */
      const groups = new Map();
      for (const command of commands.values()) {
        if (command.shortcut === undefined) continue;
        if (!groups.has(command.group)) groups.set(command.group, []);
        /** @type {{ label: string, shortcut: string }[]} */ (groups.get(command.group)).push({ label: command.label, shortcut: command.shortcut });
      }
      return [...groups].map(([group, items]) => ({ group, items }));
    },
  };
}
