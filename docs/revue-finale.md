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
| Complexité cyclomatique > 15 | 53 → 51 (lot 1) → **49** (lot 2, en cours) |
| Complexité cyclomatique > 25 | 14 → 12 (lot 1) → **4** (lot 2, en cours) |
| Fonctions de plus de 100 lignes | 60 (dont 22 de plus de 200 : des fabriques de contrôleurs) |
| Exports jamais utilisés, nulle part | 1 → **0** (supprimé, gardé par un test) |
| Plus gros fichiers | `dev/studio.html` 1 465 l (CSS en ligne compris), `layer-kinds.js` 888 l (données), `dev/scene-editor.js` 839 l, `dev/background-tuner-runtime.js` 822 l, `scene-runtime.js` 723 l |

Lecture : le code est **typé sans dette** et bien couvert ; le risque est ailleurs, dans quelques fonctions très ramifiées et dans de grosses fabriques de contrôleurs qui rassemblent trop de responsabilités.

## 2. Lots

### Lot 1 — mesurer, garder, premiers nœuds (fait, 2026-11-03)

- Outil de mesure `dev/tools/complexity.cjs` ; garde du code mort `dev/dead-exports.test.js` (vue rouge sur un cas réel, `BUILTIN_UNIFORMS` de `components/shader-source.js`, supprimé).
- `describePatch` (`dev/scene-editor.js`, complexité 28) devient une table `PATCH_LABELS` ; `layerDetails` (`dev/scene-diff.js`, 34) se découpe en cinq fonctions nommées qui gardent l'ordre des détails. Comportement figé **avant** par `dev/scene-editor-labels.test.js` (14 tests, un par libellé d'historique) et un test d'ordre dans `dev/scene-diff.test.js`, **puis** 12 défauts réinjectés tous vus rouges (trois survivants d'abord : l'ordre entre catégories n'était pas testé).

### Lot 2 — fonctions les plus ramifiées (en cours)

**Fait** : `animationErrors` et `canonicalAnimation` (`layer-animation.js`) découpées par phase (entrée, boucle, sortie, relance) ; `stepErrors` (`dev/operation-steps.js`) s'appuie sur une table de contrôles par propriété. Comportement figé par 22 + 16 défauts réinjectés ; deux survivants ont fait ajouter les tests de bornes des gestes (`stepErrors : chaque valeur…`). Complexité > 25 : 12 → **9** ; > 15 : 51 → **49**. `readDefinition` (réglages exposés du code) lit chaque type dans sa fonction (23 défauts réinjectés, 11 survivants d'abord, un seul équivalent restant). **Défaut trouvé en chemin et corrigé** : les gestes enregistrés ne connaissaient ni `filters`, ni `mask`, ni `animation` (et ne savaient pas retirer une liaison ou une animation) — une commande personnalisée enregistrée pendant un réglage de ces propriétés était refusée à la validation ; elle les enregistre, les valide et les rejoue désormais, retrait compris (8 défauts réinjectés détectés). `evaluateAnimation` découpée en `phasesAt` (où en sont l'entrée et la sortie) et `contentAt` (état du contenu) : 18 défauts réinjectés, 3 survivants dont 2 ont fait écrire les tests d'enchaînement des phases (boucle après le délai, passage de l'entrée à la sortie) et 1 équivalent (`departure` vaut 0 hors sortie). `resizeRect` découpée en `lockRatio` et `anchoredOrigin` : 27 défauts réinjectés, 9 survivants dont 6 ont fait écrire les tests manquants (plancher par dimension, bords et angles ouest avec proportions liées, plancher sous proportions liées, hauteur nulle) et 3 équivalents. Le clavier de la toile (`onKeyDown`, 27) devient un module pur `dev/canvas-keys.js` (touche → action, testable) et l'exécution des actions ; 24 défauts réinjectés tous détectés, dont un survivant (l'annulation de la réaction du navigateur) qui a fait ajouter un contrôle de bout en bout ; l'essai e2e de la toile couvre désormais Suppr, Ctrl+D, Ctrl+A, Échap et le zoom au clavier. Même découpage pour le clavier du panneau des couches (29) : module pur `dev/layers-list-keys.js` ; 23 défauts réinjectés, 4 survivants du branchement (réordonner, replier au clavier, annulation du défilement) ont fait renforcer les essais e2e des couches et des groupes, tous détectés ensuite.

Les fonctions de complexité > 25 restantes, dans cet ordre de risque (une fonction à la fois, comportement figé par un test **avant** de toucher, défauts réinjectés **après**) : `DotGridAnimated.update` (34), `host.js fetch` (32), `operation-steps.stepErrors` (32), `code-params.readDefinition` (31), `layer-animation.evaluateAnimation` (30), le gestionnaire de clavier de `layers-panel-controller` (29), `layer-animation.animationErrors` (29), `asset-format.sniffAssetType` (28), `canvas-overlay-controller.onKeyDown` (27), `canvas-geometry.resizeRect` (26), `layer-animation.canonicalAnimation` (26). Cible : aucune fonction au-dessus de 25, puis au-dessus de 20.

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
