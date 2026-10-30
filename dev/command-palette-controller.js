// @ts-check
/**
 * dev/command-palette-controller.js — La palette de commandes (Ctrl+K) et l'aide des raccourcis (?).
 *
 * La palette cherche dans le registre (`command-registry.js`) par mots, sans casse ni accents ; flèches pour parcourir, Entrée
 * pour exécuter, Échap pour fermer. Les commandes indisponibles restent visibles, grisées, après les autres : l'utilisateur
 * voit qu'elles existent et ce qui leur manque. L'aide liste les raccourcis déclarés et les gestes de souris.
 */

/** Les gestes de souris, qui n'ont pas de commande : à lire dans l'aide. */
const MOUSE_GESTURES = Object.freeze([
  ['Clic sur l’aperçu', 'Sélectionner la couche'],
  ['Maj + clic', 'Ajouter ou retirer de la sélection'],
  ['Alt + clic', 'Sélectionner la couche située dessous'],
  ['Glisser une couche', 'La déplacer (Maj : sur un seul axe)'],
  ['Glisser une poignée', 'Redimensionner (Maj : proportions, Alt : depuis le centre)'],
  ['Glisser dans le vide', 'Sélectionner au rectangle'],
  ['Ctrl tenu pendant un glissement', 'Suspendre l’aimantation'],
  ['Ctrl + molette', 'Zoomer sous le pointeur'],
  ['Espace + glisser', 'Déplacer la vue'],
  ['Clic droit', 'Menu de la couche'],
  ['Flèches', 'Déplacer de 1 px (Maj : 10 px)'],
]);

/**
 * @param {{
 *   registry: ReturnType<typeof import('./command-registry.js').createCommandRegistry>,
 *   palette: HTMLDialogElement,
 *   input: HTMLInputElement,
 *   list: HTMLElement,
 *   help: HTMLDialogElement,
 *   helpBody: HTMLElement,
 *   helpClose: HTMLButtonElement,
 *   documentRef?: Document,
 * }} input
 */
export function createCommandPaletteController(input) {
  const documentRef = input.documentRef ?? document;
  const { registry, palette, list } = input;
  let active = 0;
  /** @type {import('./command-registry.js').ListedCommand[]} */
  let results = [];

  /** @param {number} index */
  function highlight(index) {
    const items = [...list.children];
    if (items.length === 0) return;
    const enabled = results.map((command, i) => (command.enabled ? i : -1)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    active = enabled.includes(index) ? index : enabled[0];
    items.forEach((item, i) => {
      item.classList.toggle('is-active', i === active);
      item.setAttribute('aria-selected', String(i === active));
    });
    items[active].scrollIntoView?.({ block: 'nearest' });
    input.input.setAttribute('aria-activedescendant', /** @type {HTMLElement} */ (items[active]).id);
  }

  function render() {
    results = registry.search(input.input.value);
    list.replaceChildren();
    results.forEach((command, index) => {
      const item = documentRef.createElement('li');
      item.id = `palette-item-${index}`;
      item.className = 'palette-item';
      item.setAttribute('role', 'option');
      item.classList.toggle('is-disabled', !command.enabled);
      item.setAttribute('aria-disabled', String(!command.enabled));
      const group = documentRef.createElement('span');
      group.className = 'palette-group';
      group.textContent = command.group;
      const label = documentRef.createElement('span');
      label.className = 'palette-label';
      label.textContent = command.label;
      item.append(group, label);
      if (command.shortcut !== undefined) {
        const key = documentRef.createElement('kbd');
        key.textContent = command.shortcut;
        item.appendChild(key);
      }
      item.addEventListener('click', () => run(index));
      item.addEventListener('pointermove', () => { if (command.enabled && active !== index) highlight(index); });
      list.appendChild(item);
    });
    if (results.length === 0) {
      const empty = documentRef.createElement('li');
      empty.className = 'palette-empty';
      empty.textContent = 'Aucune commande ne correspond.';
      list.appendChild(empty);
    }
    highlight(0);
  }

  /** @param {number} index */
  function run(index) {
    const command = results[index];
    if (command === undefined || !command.enabled) return;
    palette.close();
    // La commande s'exécute une fois la fenêtre refermée : le focus et la sélection sont alors ceux de l'éditeur.
    registry.run(command.id);
  }

  input.input.addEventListener('input', render);
  input.input.addEventListener('keydown', (event) => {
    const enabled = results.map((command, i) => (command.enabled ? i : -1)).filter((i) => i >= 0);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const position = enabled.indexOf(active);
      const next = enabled[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
      if (next !== undefined) highlight(next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    }
  });
  input.help.querySelector('[data-close]')?.addEventListener('click', () => input.help.close());
  input.helpClose.addEventListener('click', () => input.help.close());

  function renderHelp() {
    input.helpBody.replaceChildren();
    const sections = [...registry.shortcuts().map(({ group, items }) => ({ group, rows: items.map(({ label, shortcut }) => [shortcut, label]) })), { group: 'Souris', rows: MOUSE_GESTURES.map(([gesture, effect]) => [gesture, effect]) }];
    for (const { group, rows } of sections) {
      const section = documentRef.createElement('section');
      section.className = 'help-section';
      const title = documentRef.createElement('h3');
      title.textContent = group;
      section.appendChild(title);
      const table = documentRef.createElement('dl');
      for (const [keys, label] of rows) {
        const term = documentRef.createElement('dt');
        const kbd = documentRef.createElement('kbd');
        kbd.textContent = keys;
        term.appendChild(kbd);
        const definition = documentRef.createElement('dd');
        definition.textContent = label;
        table.append(term, definition);
      }
      section.appendChild(table);
      input.helpBody.appendChild(section);
    }
  }

  return {
    open() {
      input.input.value = '';
      render();
      if (typeof palette.showModal === 'function') palette.showModal();
      else palette.setAttribute('open', '');
      input.input.focus();
    },
    openHelp() {
      renderHelp();
      if (typeof input.help.showModal === 'function') input.help.showModal();
      else input.help.setAttribute('open', '');
    },
    isOpen: () => palette.open || input.help.open,
  };
}
