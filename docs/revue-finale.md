---
created: 2026-11-03
updated: 2026-11-03
---

# Passe finale : UX/UI, revue et refactorisation de toute la codebase

Demandée par l'owner le 2026-11-03, à mener une fois les chantiers de fonctions terminés (ils le sont : groupes, filtres animés, bibliothèque de modèles, masques, couche Code). Ce document cadre la passe **par des mesures**, pas par impression, et suit son avancement.

## 1. État mesuré au départ (2026-11-03)

Mesures reproductibles. Complexité et longueur : `dev/tools/complexity.cjs` (analyseur TypeScript, outillage de développement lancé à la demande, voir l'en-tête du fichier). Code mort : garde permanente `dev/dead-exports.test.js`.

| Mesure | Valeur |
|---|---|
| Fichiers source (hors tests et essais de bout en bout) | 204 |
| Fichiers de test unitaire | 177 (2591 tests) |
| Dette de typage (`dev/typecheck-baseline.json`) | **0** |
| Fonctions analysées | 3 305 |
| Complexité cyclomatique > 15 | 53 → **51** après le lot 1 |
| Complexité cyclomatique > 25 | 14 → **12** après le lot 1 |
| Fonctions de plus de 100 lignes | 60 (dont 22 de plus de 200 : des fabriques de contrôleurs) |
| Exports jamais utilisés, nulle part | 1 → **0** (supprimé, gardé par un test) |
| Plus gros fichiers | `dev/studio.html` 1 465 l (CSS en ligne compris), `layer-kinds.js` 888 l (données), `dev/scene-editor.js` 839 l, `dev/background-tuner-runtime.js` 822 l, `scene-runtime.js` 723 l |

Lecture : le code est **typé sans dette** et bien couvert ; le risque est ailleurs, dans quelques fonctions très ramifiées et dans de grosses fabriques de contrôleurs qui rassemblent trop de responsabilités.

## 2. Lots

### Lot 1 — mesurer, garder, premiers nœuds (fait, 2026-11-03)

- Outil de mesure `dev/tools/complexity.cjs` ; garde du code mort `dev/dead-exports.test.js` (vue rouge sur un cas réel, `BUILTIN_UNIFORMS` de `components/shader-source.js`, supprimé).
- `describePatch` (`dev/scene-editor.js`, complexité 28) devient une table `PATCH_LABELS` ; `layerDetails` (`dev/scene-diff.js`, 34) se découpe en cinq fonctions nommées qui gardent l'ordre des détails. Comportement figé **avant** par `dev/scene-editor-labels.test.js` (14 tests, un par libellé d'historique) et un test d'ordre dans `dev/scene-diff.test.js`, **puis** 12 défauts réinjectés tous vus rouges (trois survivants d'abord : l'ordre entre catégories n'était pas testé).

### Lot 2 — fonctions les plus ramifiées (à faire)

Les 12 fonctions de complexité > 25, dans cet ordre de risque (une fonction à la fois, comportement figé par un test **avant** de toucher, défauts réinjectés **après**) : `DotGridAnimated.update` (34), `host.js fetch` (32), `operation-steps.stepErrors` (32), `code-params.readDefinition` (31), `layer-animation.evaluateAnimation` (30), le gestionnaire de clavier de `layers-panel-controller` (29), `layer-animation.animationErrors` (29), `asset-format.sniffAssetType` (28), `canvas-overlay-controller.onKeyDown` (27), `canvas-geometry.resizeRect` (26), `layer-animation.canonicalAnimation` (26). Cible : aucune fonction au-dessus de 25, puis au-dessus de 20.

### Lot 3 — découper les grosses fabriques (à faire)

`startBackgroundTuner` (741 l : câblage de tous les contrôleurs du Studio), `createSceneEditor` (706 l : toutes les commandes d'édition), `createSceneRuntime` (556 l), `createLayersPanelController` (548 l), `createBackgroundFieldRenderer` (520 l), `createCanvasOverlayController` (434 l), `createHost` (434 l). Méthode : extraire par **domaine** (par exemple les opérations de groupe, de filtres, de masque du `scene-editor`), jamais par taille ; chaque extraction garde l'interface publique et passe `bun test`, le typage et les essais de bout en bout sans en changer un seul.

### Lot 4 — `dev/studio.html` (à faire)

Sortir le CSS en ligne (environ mille lignes) dans un `dev/studio.css` chargé par la page (sans étape de build ; vérifier la liste blanche de `dev/local-access-policy`), ranger les sections de l'inspecteur dans l'ordre de l'usage, et supprimer les règles mortes.

### Lot 5 — UX/UI, surface par surface (à faire)

Parcourir chaque surface avec le vrai Studio (panneaux, inspecteur, timeline, toile, dialogues, palette, états vides, erreurs, clavier, lecteur d'écran, largeurs réduites) et noter ce qui frotte avant de corriger : cohérence des libellés et des unités, ordre des sections de l'inspecteur (qui a beaucoup grossi : filtres, masque, animations, liaisons, timeline), états vides utiles, retours d'erreur, ordre de tabulation, contrastes. Chaque correction d'interface passe `bun dev/e2e/run.js`.

### Lot 6 — gardes permanentes (au fil de l'eau)

Chaque classe de défaut trouvée repart avec une règle totale et décidable (comme `dev/dead-exports.test.js`), jamais un balayage jetable.

## 3. Règles de la passe

- Aucun changement de comportement sans décision de l'owner : une refactorisation garde `bun test`, `bun dev/typecheck.js` et `bun dev/e2e/run.js` verts, et ses défauts réinjectés prouvent que rien n'a bougé.
- Un commit par lot logique, poussé en fin de lot.
- La mesure décide de l'ordre ; l'inventaire se refait à la fin pour comparer.
