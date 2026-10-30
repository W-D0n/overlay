// @ts-check
/**
 * dev/context-menu-controller.js — Le menu contextuel (clic droit) d'une couche, sur l'aperçu comme dans la liste.
 *
 * Il ne définit aucune action : il présente des commandes du registre (`command-registry.js`) avec leur raccourci et leur
 * disponibilité. Un clic droit sur une couche non sélectionnée la sélectionne d'abord, comme dans un éditeur graphique.
 * Échap, un clic ailleurs ou le défilement le ferment ; les flèches le parcourent.
 */

/** Les groupes du menu, séparés par un filet. */
const MENU = Object.freeze([
  ['edit.copy', 'edit.cut', 'edit.paste', 'edit.duplicate', 'edit.delete'],
  ['edit.copyStyle', 'edit.pasteStyle'],
  ['layer.toggleVisible', 'layer.toggleLock', 'layer.solo'],
  ['layer.top', 'layer.up', 'layer.down', 'layer.bottom'],
  ['position.preset.full', 'position.align.hcenter', 'position.align.vcenter', 'layer.reset'],
]);

/**
 * @param {{
 *   menu: HTMLElement,
 *   registry: ReturnType<typeof import('./command-registry.js').createCommandRegistry>,
 *   documentRef?: Document,
 * }} input
 */
export function createContextMenuController(input) {
  const documentRef = input.documentRef ?? document;
  const { menu, registry } = input;
  /** @type {HTMLButtonElement[]} */
  let items = [];

  function close() {
    menu.hidden = true;
    menu.replaceChildren();
    items = [];
  }

  /**
   * Ouvre le menu à un point de la page (pixels d'écran).
   * @param {number} x
   * @param {number} y
   */
  function open(x, y) {
    menu.replaceChildren();
    items = [];
    const listed = new Map(registry.list().map((command) => [command.id, command]));
    MENU.forEach((group, index) => {
      const present = group.map((id) => listed.get(id)).filter((command) => command !== undefined);
      if (present.length === 0) return;
      if (index > 0 && menu.children.length > 0) {
        const rule = documentRef.createElement('div');
        rule.className = 'context-rule';
        rule.setAttribute('role', 'separator');
        menu.appendChild(rule);
      }
      for (const command of present) {
        if (command === undefined) continue;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'context-item';
        button.setAttribute('role', 'menuitem');
        button.disabled = !command.enabled;
        const label = documentRef.createElement('span');
        label.textContent = command.label;
        button.appendChild(label);
        if (command.shortcut !== undefined) {
          const key = documentRef.createElement('kbd');
          key.textContent = command.shortcut;
          button.appendChild(key);
        }
        button.addEventListener('click', () => {
          close();
          registry.run(command.id);
        });
        menu.appendChild(button);
        items.push(button);
      }
    });
    menu.hidden = false;
    // Le menu reste entièrement visible : on le replie contre le bord de la fenêtre si besoin.
    const view = documentRef.defaultView;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.max(4, Math.min(x, (view?.innerWidth ?? x + width) - width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, (view?.innerHeight ?? y + height) - height - 4))}px`;
    items.find((button) => !button.disabled)?.focus();
  }

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const enabled = items.filter((button) => !button.disabled);
    const position = enabled.indexOf(/** @type {HTMLButtonElement} */ (documentRef.activeElement));
    enabled[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]?.focus();
  });
  /** @param {Event} event */
  const onOutside = (event) => {
    if (!menu.hidden && !menu.contains(/** @type {Node} */ (event.target))) close();
  };
  documentRef.addEventListener('pointerdown', onOutside, true);
  documentRef.addEventListener('scroll', close, true);
  close();

  return {
    open,
    close,
    isOpen: () => !menu.hidden,
    destroy() {
      documentRef.removeEventListener('pointerdown', onOutside, true);
      documentRef.removeEventListener('scroll', close, true);
    },
  };
}
