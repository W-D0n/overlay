# MAP — Overlay Stream D0n / Mozaïk

> Feuille de route et état d'avancement. Mis à jour en clôture de session (`/done`).

## Focus actuel

**Session 3 — livrée.** Moteur page-unique : `index.html` (`#bg-layer` DotGrid permanent + `#scene-root`
+ un `<template>` par scène), `scene-runtime.js` (montage/swap/`crossfade`·`cut`/visibilité), `scene-resolve.js`
(helpers purs, 22 tests), registries + wires des 3 scènes de référence (`discussion`, `brb`, `codage`).
Spec `docs/specs/scene-runtime-engine.md` (41 AC). AC purs : `bun test` vert ; AC d'orchestration :
vérifiés fonctionnellement (montage, `cut`/`crossfade`, visibilité full·minimal·hidden, anti-accumulation).
**S3b — livrée.** 5 scènes restantes migrées : `interview`, `react`, `creation` (variante A seule —
la variante B/panneau référence n'a plus de sens en page-unique, abandonnée, voir `docs/inbox.md`),
`fin`. `bun test` vert (63 tests). Vérification visuelle OBS native **non faite cette session**
(pas de navigateur headless disponible dans l'environnement) — à faire par l'owner avant mise en prod.

## Découpage des sessions

| Session | Périmètre | État |
|---|---|---|
| S1 | DotGridAnimated — couches 1 (base aléatoire) + 2 (Simplex ambiant par mode) | ✅ fait |
| S2 | Format de config de scène + protocole `{type,data}` étendu | ✅ fait |
| S3 | Moteur page-unique + 3 scènes de référence ([spec](specs/scene-runtime-engine.md)) | ✅ fait |
| S3b | Migration des 5 scènes restantes + leurs configs | ✅ fait |
| S4 | Relais Bun (WS + HTTP `/emit`, auth OBS, secret en env) | ⬜ à venir |
| S5 | Éditeur jalon 1 (placement drag + lecture anchor/offset) | ⬜ à venir |
| Épopée | Éditeur complet, orchestration OBS programmatique, skill recherche graphique | ⬜ hors scope |

## Détail S1 (livré)

- `components/simplex.js` — Simplex 2D Gustavson, `simplex2(x,y) → [-1,1]`, zéro dépendance.
- `components/DotGridAnimated.js` — couches 1+2, stockage SoA, `setMode`/`destroy` fonctionnels, `trigger`/`morphTo` en stubs.
- DotGrid testé sur `scenes/BRB.html` (S1) — depuis S3, monté par le runtime dans `index.html` (`#bg-layer`).

## Détail S2 (livré)

- `docs/specs/scene-config-protocol.md` — spec (reviewée 2× : 38 AC, 17 typedefs, 0 smoke test).
- `protocol.js` — logique pure : `reduceMessage` (11 types), `validateSceneConfig` (V0→V9), `DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE`. Zéro DOM/réseau/temps.
- `store.js` — refactoré en coquille d'effets (plus de `switch`) ; horloge injectée + effet `reset-duration-timer`.
- `types.js` — +17 typedefs, `StreamState` étendu (`currentScene`, `visibilityLevel`).
- `scenes/{discussion,brb,codage}.config.js` — 3 configs de référence.
- `protocol.test.js` — 41 tests `bun test` autonomes.
- Décisions structurantes : AD-1 (logique pure / effets), AD-2 (placement dans le CSS), AD-3 (état de repos). Voir `devlog.md`.

## Détail S3 (livré)

- `index.html` — page unique : `#bg-layer` (DotGrid permanent), `#scene-root`, un `<template data-scene>` par scène de référence. Remplace les Browser Sources HTML séparées des 3 scènes migrées.
- `scene-runtime.js` — orchestrateur DOM : montage initial, swap + transition (`cut`/`crossfade`), visibilité, garde double-fire. Écoute `overlay:scene-change` + `overlay:visibility-change` ; ne câble pas `overlay:morph` (AD-7).
- `scene-resolve.js` — helpers purs (`resolveTransition`, `isLayerVisible`, `resolveDotgridMode`, `toCssEasing`). Zéro DOM/réseau/temps.
- `component-registry.js` (`ComponentName` → factory) + `scenes/registry.js` (`SceneId` → config + wire).
- `scenes/{discussion,brb,codage}.wire.js` — câblage composants ↔ store par scène (AD-6).
- `scene-resolve.test.js` — 22 tests `bun test`.
- Modifs surfaces partagées : `components/index.js` (`AlertBanner.destroy()`), `components/DotGridAnimated.js` (`GRID_MODES`), `types.js` (`ComponentInstance`, `MountedScene`, `SceneWire`).
- Décisions : AD-4 (périmètre 3 scènes), AD-5 (`<template>` inline), AD-6 (wire par scène), AD-7 (`hidden` masque le fond).
- `scenes/{BRB,Discussion,Codage}.html` supprimées (superseded par `index.html`).

## Frictions séquencées (issues de la review S2)

- FRIC-S2-01 : 5 configs restantes (interview, react, creation, fin, jeu) → S3.
- FRIC-S2-03 : restriction `imageUrl` (morph bitmap) aux assets locaux → couche 3A.
- FRIC-S2-04 : doc sécurité diffusion publique → S4/publication.
- FRIC-S2-05 : format d'échange de l'éditeur (placement = CSS) → S5.

## Détail S3b (livré)

- `scenes/{interview,react,creation,fin}.config.js` + `.wire.js` — 4 configs/wires restantes.
- `index.html` — 4 `<template>` + CSS scopé ajoutés ; `scenes/registry.js` étendu (8 scènes).
- `scenes/{Interview,React,Creation3D,FinStream}.html` supprimées (superseded).
- Décision de scope : scène `creation` ne porte que la variante A (capture + colonne widgets) de
  l'ancien `Creation3D.html` — la variante B (panneau référence, pilotée par `?mode=B` sur une 2e
  Browser Source) est incompatible avec l'architecture page-unique (1 seule Browser Source) et n'a
  pas été redemandée depuis ; abandonnée (zero preemptive code), voir `docs/inbox.md`.
- Gap : vérification visuelle des 4 nouvelles scènes en navigateur/OBS **non faite** (pas d'outil
  headless disponible dans l'environnement d'exécution) — `bun test` vert uniquement. À faire par
  l'owner avant mise en prod (préview 1920×1080 dézoomée, ou OBS natif).

## Reste à faire (hors S1, déjà identifié)

- Couches 3 (morphisme) et 4 (événements stream) du DotGrid → sessions ultérieures, voir `HANDOFF_overlay_dotgrid.md`.
