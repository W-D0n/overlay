# Devlog — Overlay Stream D0n / Mozaïk

> Décisions structurantes, par session. Mis à jour en clôture (`/done`).

## 2026-06-07 — S2 : protocole de scène + logique pure

**Ce qui a été fait :**
- Format `SceneConfig` sérialisable (couches nommées, visibilité par niveau, composants, mode DotGrid) + 3 configs de référence.
- Protocole `{type,data}` étendu : `scene.set`, `visibility.set`, `morph.trigger` (+ CustomEvents DOM).
- Extraction de toute la logique du protocole dans `protocol.js` **pur** (`reduceMessage`, `validateSceneConfig`), `store.js` réduit à une coquille d'effets.
- Tests autonomes `bun test` (41 tests) — garantie algorithmique, plus aucune vérification manuelle.

**Pourquoi :**
- Projet destiné à une diffusion publique → testabilité autonome non négociable. La séparation logique pure / effets (AD-1) la rend possible sans navigateur, sans build, sans dépendance.
- Le placement vit dans le CSS, pas dans le format (AD-2) : cohérent avec `tokens.css` source de vérité ; l'éditeur S5 manipulera le CSS, pas un JSON de coordonnées.
- Toujours un état de repos sûr (AD-3) : `DEFAULT_TRANSITION` + mode DotGrid ambiant éliminent la classe « état d'animation incohérent ».

**Impact :**
- `store.js` est désormais une coquille : tout nouveau message se spécifie/teste dans `protocol.js`. Les 8 types legacy y ont été migrés (horloge injectée via `context.now`, effet `reset-duration-timer` pour `session.start`).
- `validateSceneConfig` (V0→V9) est le contrat que le runtime S3 et le futur éditeur consommeront.
- Convention de test établie : `*.test.js` à côté du module, `bun test` à la racine.

## 2026-06-08 — S3 (spec) : moteur runtime page-unique — cadrage + review

**Ce qui a été fait :**
- Spec `scene-runtime-engine.md` rédigée et reviewée (41 AC, statut `reviewed`). Session 100 % spec, aucun code.
- 4 décisions d'architecture validées owner : AD-4 (périmètre atomique = moteur + 3 scènes de référence, les 5 autres → S3b), AD-5 (structure/placement via `<template data-scene>` inline, prolonge AD-2), AD-6 (data-binding par module `scenes/[id].wire.js`, composants restent store-agnostiques), AD-7 (`hidden` masque tout y compris `#bg-layer`).
- `/spec-review` : 1🔴 3🟠 5🟡 trouvés puis tous corrigés dans la spec — notamment le gap critique easing→CSS (helper pur `toCssEasing` : les jetons `TransitionEasing` camelCase ne sont pas des timing-functions CSS valides).

**Pourquoi :**
- Découper le runtime (DOM, non testable sans navigateur) de la logique pure (`scene-resolve.js` : `resolveTransition`/`isLayerVisible`/`resolveDotgridMode`/`toCssEasing`) prolonge AD-1 : la part prouvable est sous `bun test`, le reste vérifié visuellement OBS — split assumé et documenté.
- AD-6 préserve la séparation composant/état acquise en S2 : le binding reste du code par scène jusqu'au jalon « data-binding déclaratif » de l'éditeur (pas de code préemptif).

**Impact :**
- Implémentation S3 prête, découpée en 4 sous-étapes (voir `docs/handoff-latest.md`). 12 fichiers : 9 à créer, 3 surfaces à modifier (`DotGridAnimated.js` exporte `GRID_MODES`, `index.js` ajoute `AlertBanner.destroy()`, `types.js` +3 typedefs).
- Garde-fous figés pour l'implémentation : instance `DotGridAnimated` unique (AC-02), `overlay:morph` non câblé (séquencé couche 3), `grid.setMode` jamais appelé avec `null`.
- Tooling : référence morte `docs/workflows/spec.md` retirée du skill `/spec` global.

## 2026-06-08 — S3 (implémentation) : moteur runtime page-unique livré

**Ce qui a été fait :**
- Moteur livré : `index.html` (page unique : `#bg-layer` + `#scene-root` + un `<template>` par scène), `scene-runtime.js` (montage / swap / `cut`·`crossfade` / visibilité, garde double-fire), `scene-resolve.js` (4 helpers purs, 22 tests `bun test`), `component-registry.js`, `scenes/registry.js`, wires des 3 scènes de référence.
- Surfaces partagées : `DotGridAnimated.js` (`GRID_MODES`), `index.js` (`AlertBanner.destroy()`), `types.js` (+3 typedefs). 3 scènes HTML autonomes (`BRB`/`Discussion`/`Codage`) supprimées (superseded par `index.html`).
- AC d'orchestration vérifiés fonctionnellement (preview 1920×1080, events réels) : DotGrid unique jamais recréé, `cut`/`crossfade`, anti-accumulation (1 scène en régime stable), visibilité full·minimal·hidden + ré-application du niveau à une scène montée. Zéro warning/erreur console.

**Pourquoi :**
- Conventions de portage « couches » établies à l'implémentation (non figées par la spec) : tout contenu visible doit vivre dans un `[data-layer]` (sinon hors du contrat de visibilité) → décorations (nom, footer) repliées dans la couche sémantique adjacente ; CSS scopé par `.scene[data-scene="id"]` pour éviter les collisions de classes pendant un `crossfade` (2 scènes coexistantes) ; **classes** (jamais d'`id`) pour les éléments DOM-pur live, car les `id` dupliqueraient pendant la transition.
- Incohérence interne de la spec corrigée : `ComponentInstance.show` typé `unknown` (vue unifiée du registry, types précis sur les factories), aligné sur sa propre note de rationale.

**Impact :**
- S3b (5 scènes restantes) suit ce gabarit : un `<template data-scene>` + une `*.config.js` + un `*.wire.js` par scène, structure scopée par scène.
- Le runtime est l'unique point de montage ; les composants restent store-agnostiques — seul le wire importe `store.js` (AD-6).
- `.claude/launch.json` aligné sur `bunx` (contrainte « Bun uniquement ») pour le serveur de preview statique.
