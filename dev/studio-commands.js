// @ts-check
/**
 * dev/studio-commands.js — Les commandes du Studio, assemblées dans un registre (`command-registry.js`).
 *
 * Chaque fonction de l'éditeur y a une commande : édition, couches, position, vue, publication, aide. Les surfaces (palette,
 * aide des raccourcis, menu contextuel, raccourcis clavier globaux) lisent ce registre ; ce module est le seul endroit où
 * l'on dit ce que fait chaque commande et quand elle est disponible.
 *
 * Les raccourcis déjà gérés par le panneau de couches ou la surcouche de l'aperçu sont déclarés `bind: false` : ils
 * figurent dans l'aide sans être traités deux fois.
 */
import { createCommandRegistry } from './command-registry.js';
import { isIdentityKind } from '../layer-kinds.js';
import { PLACEMENT_PRESETS, alignPlacements, distributePlacements } from './placement-math.js';

/**
 * @param {{
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   clipboard: ReturnType<typeof import('./layer-clipboard.js').createLayerClipboard>,
 *   labelOf: (kind: string) => string,
 *   addableKinds: readonly string[],
 *   defaultOptions: (kind: string) => Record<string, unknown>,
 *   view: {
 *     zoomIn(): void, zoomOut(): void, fit(): void, zoom100(): void,
 *     toggle(key: 'snap' | 'grid' | 'rulers' | 'safe'): void,
 *   },
 *   publication: {
 *     publish(): void, discard(): void, showChanges(): void, toggleCompare(): void, testTransition(): void,
 *   },
 *   dialogs: { palette(): void, shortcuts(): void, history(): void, diagnostic(): void },
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 * }} deps
 */
export function createStudioCommands({ studio, clipboard, labelOf, addableKinds, defaultOptions, view, publication, dialogs, report }) {
  const registry = createCommandRegistry();
  const { editor } = studio;

  const selection = () => editor.state().selection;
  const hasSelection = () => selection().length > 0;
  const layers = () => studio.state().scene.layers;
  const selectedLayers = () => layers().filter((layer) => selection().includes(layer.id));
  const multi = () => selection().length >= 2;
  const isDraft = () => studio.state().isDraft;

  /** Exécute une commande d'éditeur et signale un refus. @param {{ ok: boolean, message?: string }} result */
  const settle = (result) => {
    if (!result.ok && result.message !== undefined) report.error(result.message);
    return result.ok;
  };

  /** @param {import('./command-registry.js').Command[]} list */
  const add = (list) => registry.registerAll(list);

  // ── Édition ─────────────────────────────────────────────────────────────
  add([
    { id: 'edit.undo', label: 'Annuler', group: 'Édition', shortcut: 'Ctrl+Z', bind: false, keywords: ['défaire'], enabled: () => editor.state().canUndo, run: () => { settle(editor.undo()); } },
    { id: 'edit.redo', label: 'Rétablir', group: 'Édition', shortcut: 'Ctrl+Maj+Z', bind: false, keywords: ['refaire'], enabled: () => editor.state().canRedo, run: () => { settle(editor.redo()); } },
    {
      id: 'edit.copy', label: 'Copier les couches', group: 'Édition', shortcut: 'Ctrl+C', enabled: hasSelection,
      run: () => { if (clipboard.copy(selectedLayers())) report.ok(`${selection().length} couche(s) copiée(s)`); },
    },
    {
      id: 'edit.cut', label: 'Couper les couches', group: 'Édition', shortcut: 'Ctrl+X', enabled: hasSelection,
      run: () => { if (clipboard.copy(selectedLayers())) settle(editor.removeLayers([...selection()])); },
    },
    {
      id: 'edit.paste', label: 'Coller les couches', group: 'Édition', shortcut: 'Ctrl+V', enabled: () => clipboard.hasLayers(),
      run: () => {
        const content = clipboard.read();
        if (!content.ok) { report.error(content.error); return; }
        settle(editor.insertLayers(content.layers));
      },
    },
    {
      id: 'edit.copyStyle', label: 'Copier le style', group: 'Édition', shortcut: 'Ctrl+Alt+C', keywords: ['réglages', 'opacité'], enabled: hasSelection,
      run: () => { const last = selectedLayers().at(-1); if (last !== undefined) { clipboard.copyStyle(last); report.ok('style copié'); } },
    },
    {
      id: 'edit.pasteStyle', label: 'Coller le style', group: 'Édition', shortcut: 'Ctrl+Alt+V', keywords: ['réglages', 'opacité'], enabled: () => hasSelection() && clipboard.hasStyle(),
      run: () => {
        const content = clipboard.read();
        if (content.ok && content.style !== null) settle(editor.applyStyle([...selection()], content.style));
      },
    },
    { id: 'edit.duplicate', label: 'Dupliquer', group: 'Édition', shortcut: 'Ctrl+D', bind: false, enabled: () => hasSelection() && selectedLayers().every((layer) => !isIdentityKind(layer.kind)), run: () => { settle(editor.duplicateLayers([...selection()])); } },
    { id: 'edit.delete', label: 'Supprimer', group: 'Édition', shortcut: 'Suppr', bind: false, enabled: hasSelection, run: () => { settle(editor.removeLayers([...selection()])); } },
    { id: 'edit.selectAll', label: 'Tout sélectionner', group: 'Édition', shortcut: 'Ctrl+A', bind: false, enabled: () => layers().length > 0, run: () => editor.selectAll() },
    { id: 'edit.deselect', label: 'Désélectionner', group: 'Édition', shortcut: 'Échap', bind: false, enabled: hasSelection, run: () => editor.clearSelection() },
  ]);

  // ── Couches ─────────────────────────────────────────────────────────────
  for (const kind of addableKinds) {
    add([{
      id: `layer.add.${kind}`,
      label: `Ajouter : ${labelOf(kind)}`,
      group: 'Couches',
      keywords: ['nouvelle', 'effet', 'couche'],
      enabled: () => !(isIdentityKind(kind) && layers().some((layer) => layer.kind === kind)),
      run: () => { settle(editor.addLayer({ kind, ...(isIdentityKind(kind) ? {} : { options: defaultOptions(kind) }) })); },
    }]);
  }
  add([
    {
      id: 'layer.toggleVisible', label: 'Afficher ou masquer', group: 'Couches', shortcut: 'Ctrl+Maj+H', keywords: ['œil', 'visibilité'], enabled: hasSelection,
      run: () => { const first = selectedLayers()[0]; if (first !== undefined) settle(editor.setLayers([...selection()], { visible: !first.visible })); },
    },
    {
      id: 'layer.toggleLock', label: 'Verrouiller ou déverrouiller', group: 'Couches', shortcut: 'Ctrl+Maj+L', keywords: ['cadenas'], enabled: hasSelection,
      run: () => { const first = selectedLayers()[0]; if (first !== undefined) settle(editor.setLayers([...selection()], { locked: first.locked !== true })); },
    },
    {
      id: 'layer.solo', label: 'Isoler dans l’aperçu', group: 'Couches', keywords: ['solo'], enabled: hasSelection,
      run: () => { const primary = selection().at(-1); if (primary !== undefined) editor.setSolo(editor.state().solo === primary ? null : primary); },
    },
    { id: 'layer.up', label: 'Monter d’un cran', group: 'Couches', shortcut: 'Ctrl+]', keywords: ['ordre', 'devant'], enabled: hasSelection, run: () => { settle(editor.moveLayers([...selection()], 'up')); } },
    { id: 'layer.down', label: 'Descendre d’un cran', group: 'Couches', shortcut: 'Ctrl+[', keywords: ['ordre', 'derrière'], enabled: hasSelection, run: () => { settle(editor.moveLayers([...selection()], 'down')); } },
    { id: 'layer.top', label: 'Mettre au premier plan', group: 'Couches', shortcut: 'Ctrl+Maj+]', keywords: ['ordre', 'devant'], enabled: hasSelection, run: () => { settle(editor.moveLayers([...selection()], 'top')); } },
    { id: 'layer.bottom', label: 'Mettre à l’arrière-plan', group: 'Couches', shortcut: 'Ctrl+Maj+[', keywords: ['ordre', 'derrière'], enabled: hasSelection, run: () => { settle(editor.moveLayers([...selection()], 'bottom')); } },
    { id: 'layer.reset', label: 'Réinitialiser la position et l’opacité', group: 'Couches', keywords: ['plein cadre'], enabled: hasSelection, run: () => { settle(editor.resetLayers([...selection()])); } },
  ]);

  // ── Position ────────────────────────────────────────────────────────────
  /** @param {import('./placement-math.js').AlignMode} mode @param {string} label */
  const align = (mode, label) => ({
    id: `position.align.${mode}`, label, group: 'Position', keywords: ['aligner'], enabled: hasSelection,
    run: () => {
      const chosen = selectedLayers();
      const patches = alignPlacements(Object.fromEntries(chosen.map((layer) => [layer.id, layer.placement])), mode, multi() ? 'selection' : 'canvas');
      if (Object.keys(patches).length > 0) settle(editor.setPlacements(patches, { label: 'Aligner' }));
    },
  });
  add([
    align('left', 'Aligner à gauche'), align('hcenter', 'Centrer horizontalement'), align('right', 'Aligner à droite'),
    align('top', 'Aligner en haut'), align('vcenter', 'Centrer verticalement'), align('bottom', 'Aligner en bas'),
    {
      id: 'position.distribute.horizontal', label: 'Répartir horizontalement', group: 'Position', keywords: ['distribuer', 'espacer'], enabled: () => selection().length >= 3,
      run: () => { const patches = distributePlacements(Object.fromEntries(selectedLayers().map((layer) => [layer.id, layer.placement])), 'horizontal'); if (Object.keys(patches).length > 0) settle(editor.setPlacements(patches, { label: 'Répartir' })); },
    },
    {
      id: 'position.distribute.vertical', label: 'Répartir verticalement', group: 'Position', keywords: ['distribuer', 'espacer'], enabled: () => selection().length >= 3,
      run: () => { const patches = distributePlacements(Object.fromEntries(selectedLayers().map((layer) => [layer.id, layer.placement])), 'vertical'); if (Object.keys(patches).length > 0) settle(editor.setPlacements(patches, { label: 'Répartir' })); },
    },
  ]);
  for (const preset of PLACEMENT_PRESETS) {
    add([{
      id: `position.preset.${preset.id}`, label: `Position : ${preset.label}`, group: 'Position', keywords: ['prédéfinie', 'placer'], enabled: hasSelection,
      run: () => { settle(editor.setPlacements(Object.fromEntries(selection().map((id) => [id, { ...preset.placement }])), { label: preset.label })); },
    }]);
  }

  // ── Vue ─────────────────────────────────────────────────────────────────
  add([
    { id: 'view.zoomIn', label: 'Zoomer', group: 'Vue', shortcut: '+', bind: false, run: () => view.zoomIn() },
    { id: 'view.zoomOut', label: 'Dézoomer', group: 'Vue', shortcut: '-', bind: false, run: () => view.zoomOut() },
    { id: 'view.fit', label: 'Ajuster la vue', group: 'Vue', shortcut: '0', bind: false, run: () => view.fit() },
    { id: 'view.zoom100', label: 'Taille réelle (100 %)', group: 'Vue', shortcut: '1', bind: false, run: () => view.zoom100() },
    { id: 'view.snap', label: 'Basculer l’aimantation', group: 'Vue', keywords: ['aimant', 'magnétisme'], run: () => view.toggle('snap') },
    { id: 'view.grid', label: 'Basculer la grille', group: 'Vue', run: () => view.toggle('grid') },
    { id: 'view.rulers', label: 'Basculer les règles', group: 'Vue', run: () => view.toggle('rulers') },
    { id: 'view.safe', label: 'Basculer les zones de sécurité', group: 'Vue', run: () => view.toggle('safe') },
  ]);

  // ── Publication ─────────────────────────────────────────────────────────
  add([
    { id: 'publish.send', label: 'Publier à l’antenne', group: 'Publication', shortcut: 'Ctrl+Entrée', keywords: ['envoyer', 'live'], enabled: isDraft, run: () => publication.publish() },
    { id: 'publish.discard', label: 'Abandonner le brouillon', group: 'Publication', keywords: ['annuler', 'revenir'], enabled: isDraft, run: () => publication.discard() },
    { id: 'publish.changes', label: 'Voir les changements avant de publier', group: 'Publication', keywords: ['récapitulatif', 'diff'], enabled: isDraft, run: () => publication.showChanges() },
    { id: 'publish.compare', label: 'Comparer avec l’antenne (avant / après)', group: 'Publication', shortcut: 'Ctrl+B', keywords: ['bascule'], enabled: isDraft, run: () => publication.toggleCompare() },
    { id: 'publish.testTransition', label: 'Tester la transition d’arrivée', group: 'Publication', keywords: ['animation', 'fondu', 'balayage'], run: () => publication.testTransition() },
  ]);

  // ── Aide et fenêtres ────────────────────────────────────────────────────
  add([
    { id: 'help.palette', label: 'Palette de commandes', group: 'Aide', shortcut: 'Ctrl+K', run: () => dialogs.palette() },
    { id: 'help.shortcuts', label: 'Raccourcis clavier', group: 'Aide', shortcut: '?', keywords: ['aide'], run: () => dialogs.shortcuts() },
    { id: 'help.history', label: 'Ouvrir l’historique des publications', group: 'Aide', run: () => dialogs.history() },
    { id: 'help.diagnostic', label: 'Ouvrir le diagnostic', group: 'Aide', run: () => dialogs.diagnostic() },
  ]);

  return registry;
}
