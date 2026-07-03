# MAP — Overlay Stream D0n / Mozaïk

> Feuille de route et état d'avancement. Mis à jour en clôture de session (`/done`).

## Focus actuel

**S1→S4 livrées, pipeline de lancement stream opérationnel et validé de bout en bout (2026-07-03).**

- **Moteur page-unique** (S3, spec `docs/specs/scene-runtime-engine.md`, 41 AC) + **migration complète**
  (S3b) : `index.html` porte les **9 scènes** overlay (`discussion`, `codage`, `brb`, `jeu`,
  `interview`, `react`, `creation`, `fin`, `starting`), chacune `<template>` + `*.config.js` +
  `*.wire.js` + entrée `scenes/registry.js`. `creation` ne porte que sa variante A (panneau
  référence B abandonné, page-unique = 1 seule Browser Source, voir `docs/inbox.md`).
- **Relais Bun** (S4, `relay/server.js`, spec `docs/specs/relay-bun-s4.md`) : client OBS WebSocket v5
  (auth SHA256) traduit les changements de scène OBS en `scene.set` ; serveur WS + `POST /emit`
  (secret partagé, rate-limité 20 req/10s/IP). `docs/security.md` consolide le modèle de menace.
- **Mapping OBS réel complet** (`relay/obs-scene-map.js`) : les 9 scènes OBS de D0n (`Just Chatting`,
  `Coding`, `BRB`, `Gaming`, `Interview`, `FullScreen`, `Creation`, `Ending`, `Starting`) sont
  chacune reliées à leur scène overlay.
- **Validé bout en bout par l'owner en conditions réelles** : auth OBS OK, changement de scène OBS →
  overlay affiché en direct dans une vraie Browser Source OBS, confirmé fonctionnel sur les 9 scènes.
- **Lancement automatisé** : `.env` (chargé automatiquement par Bun) + `start-stream.bat` (double-clic
  lance serveur statique + relais en une fois) — voir `docs/obs-setup.md` §0.
- **Retours visuels de l'owner traités** : `--text-xs` 7px→13px (`tokens.css`, bug de lisibilité
  systémique), compteur de viewers retiré de tout l'overlay (métrique jugée stressante), DotGrid
  retuning visibilité/rythme (`components/DotGridAnimated.js`).
- **Outil de dev** `dev/dotgrid-tuner.html` — sliders live sur les paramètres Simplex par mode +
  baseOpacity/dotRadius, pas de persistance automatique (décision d'architecture en attente,
  voir `docs/inbox.md`).

**bun test : 76 tests verts.** Prêt pour un premier live. Backlog restant (non bloquant) :
S5 (panneau de contrôle unique) et S6 (contrôle OBS programmatique, priorisé par l'owner), voir
§Découpage des sessions.

## Découpage des sessions

| Session | Périmètre | État |
|---|---|---|
| S1 | DotGridAnimated — couches 1 (base aléatoire) + 2 (Simplex ambiant par mode) | ✅ fait |
| S2 | Format de config de scène + protocole `{type,data}` étendu | ✅ fait |
| S3 | Moteur page-unique + 3 scènes de référence ([spec](specs/scene-runtime-engine.md)) | ✅ fait |
| S3b | Migration des 5 scènes restantes + leurs configs | ✅ fait |
| S4 | Relais Bun (WS + HTTP `/emit`, auth OBS, secret en env) | ✅ fait |
| S5 | Persistance `dotgrid-tuner` (portée réduite le 2026-07-04 — placement drag & drop reporté, prérequis `anchor`/`offset` manquant, voir `docs/inbox.md`) | ✅ fait |
| S6 | Contrôle programmatique d'OBS (créer/piloter scènes OBS depuis le panneau S5) — **priorisé par l'owner (2026-07-03)**, voir `docs/inbox.md` §Contrôle OBS centralisé | ⬜ à venir, dépend de S5 |
| Épopée | Éditeur complet au-delà de S5/S6 (bibliothèque de transitions, binding déclaratif, export/import config), skill recherche graphique | ⬜ hors scope |

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
- Vérification visuelle des 4 nouvelles scènes faite par l'owner en preview navigateur 1920×1080
  (`bunx serve` — port 5500 par défaut occupé sur cette machine, servi sur 5501), puis confirmée en
  Browser Source OBS réelle (2026-07-03) : fonctionnelles.
- **Post-S3b (2026-07-03)** : 9e scène `starting` ajoutée (écran d'attente pré-live) suite à la
  découverte d'une scène OBS `Starting` chez l'owner sans équivalent overlay. `scenes/starting.{config,wire}.js`
  + `<template>` + mode DotGrid dédié + entrées `SceneId`/`DotGridMode` (`types.js`, `protocol.js`).
  Retrait du compteur de viewers de toutes les scènes (feedback owner) + correctif `--text-xs`
  7px→13px (`tokens.css`, bug de lisibilité systémique) traités dans la même fenêtre de travail.

## Détail S4 (livré)

- `relay/obs-scene-map.js` — table de correspondance nom-scène-OBS → `SceneId` + fonction pure, testée.
- `relay/obs-auth.js` — calcul de l'auth SHA256 OBS WS v5, testé contre une référence `node:crypto` indépendante.
- `relay/server.js` — orchestration : client OBS WS v5 (reconnexion 3s), serveur `Bun.serve` (WS overlay + `POST /emit`), auth par secret partagé, refuse de démarrer sans `OVERLAY_RELAY_SECRET`.
- `obs-config.example.js` (committé) / `obs-config.local.js` (gitignoré) — `store.js` importe le local en priorité, retombe sur l'exemple (token vide → fallback statique).
- `store.js` — connexion WS pointe désormais sur le relais (`RELAY_WS_URL`, port `4456`) au lieu du port OBS natif (`4455`, repris par OBS lui-même).
- `docs/obs-setup.md` — §4 ajouté (activation OBS WS, config secret, lancement relais, `/emit`).
- `relay/rate-limiter.js` — fenêtre glissante (20 req/10s/IP) sur `/emit`, testée (`bun test`, 5 tests).
- `docs/security.md` — modèle de menace consolidé (S2+S4), règles d'exploitation (item FRIC-S2-04).
- Décisions validées avec l'owner (2026-07-03) : `/emit` comme point d'entrée générique (pas d'intégration Twitch construite) ; auth = secret partagé simple (pas de JWT/session).

## Détail S5 (livré, portée réduite)

- `dev/dotgrid-params-format.js` — logique pure de remplacement du bloc `MODE_PARAMS` +
  `baseOpacity`/`dotRadius` dans le source, testée (4 tests).
- `dev/tuner-server.js` — serveur de dev séparé (`bun dev/tuner-server.js`, jamais lancé en live),
  route unique `POST /save`, réécrit `components/DotGridAnimated.js` directement.
- `dev/dotgrid-tuner.html` — bouton "Sauvegarder" ajouté (bouton "Copier" gardé en secours).
- Testé bout en bout manuellement (sauvegarde réelle, vérification du fichier, restauration).
- Décision de scope (2026-07-04) : le drag & drop de placement (portée initiale du jalon 1) est
  **reporté** — prérequis `anchor`/`offset` jamais construit (AD-2 a mis le placement en CSS),
  migration non planifiée tant qu'un besoin concret ne la justifie pas. Voir `docs/inbox.md`.

## Reste à faire (hors S1, déjà identifié)

- Couches 3 (morphisme) et 4 (événements stream) du DotGrid → sessions ultérieures, voir `HANDOFF_overlay_dotgrid.md`.
- Intégration Twitch EventSub/chat réelle qui appellerait `/emit` (hors scope S4, voir `docs/specs/relay-bun-s4.md` §Périmètre Exclu).
- Scènes OBS manquantes pour `interview`/`react`/`creation`/`fin` (créer les scènes côté OBS + étendre `relay/obs-scene-map.js` quand elles existent).
- Persistance des paramètres `dotgrid-tuner` (demande owner, voir `docs/inbox.md`) — décision d'architecture à trancher avant implémentation.
