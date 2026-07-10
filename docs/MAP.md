# MAP — Overlay Stream D0n / Mozaïk

> Feuille de route et état d'avancement. Mis à jour en clôture de session (`/done`).

## Focus actuel

**S1→S8, Track A (transitions) et Track B (effets de fond) livrées — 150 tests verts (2026-07-07).**

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
| S7 | Panneau de placement — format `Placement` (pixels absolus, pas d'ancrage) + migration des 9 scènes + panneau drag & drop + persistance. 5 sessions atomiques, spec `docs/specs/scene-placement-protocol.md`. Owner a demandé "le panneau complet" (2026-07-04) après S5 réduite. | ✅ fait |
| S6 | Contrôle programmatique d'OBS (créer/piloter scènes OBS depuis le panneau S7) — **priorisé par l'owner (2026-07-03)**, voir `docs/inbox.md` §Contrôle OBS centralisé. 4 sessions atomiques, spec `docs/specs/obs-scene-control.md`. Décision owner (2026-07-06) : routes dans `relay/server.js` (seul process tournant pendant le live), pas un process séparé — évite de dupliquer connexion/auth/reconnexion OBS déjà écrites. Session 1/4 **terminée** (2026-07-06) : `GET /obs/list-scenes`, `POST /obs/create-scene`, `POST /obs/set-current-scene`, réutilisent `sendObsRequest` (déjà écrit pour `/refresh-source`). Session 2/4 **terminée** (2026-07-06) : `GET /obs/list-scene-items`, `POST /obs/create-scene-item`, `POST /obs/set-scene-item-transform`, `POST /obs/set-scene-item-enabled` — positionnement et visibilité des sources dans une scène. Session 3/4 **terminée** (2026-07-06) : section "OBS" dans `dev/overlay-setting.html` (scènes + scene items, activer/créer une scène, ajouter/positionner/masquer une source), réutilise `RELAY_TOKEN` (`obs-config.local.js`, même pattern que `dev/dotgrid-tuner.html`). Les 3 sessions vérifiées avec un faux serveur OBS WS v5 (pas de test unitaire — convention existante des serveurs de dev, effets vérifiés manuellement/visuellement via Playwright). Session 4/4 **terminée** (2026-07-06) : vérification contre la vraie instance OBS de l'owner — `OBS_WS_URL` pointait en fait la machine locale elle-même (hypothèse d'IP LAN injoignable erronée, corrigée), OBS ouvert par l'owner. 7 routes confirmées sur une scène de test dédiée (`_test-s6`, jamais les 9 scènes réelles) : liste, création, ajout de source, positionnement et visibilité relus après écriture, activation/restauration du programme OBS. **S6 complet (4/4).** Scène `_test-s6` laissée dans OBS, à supprimer manuellement (RemoveScene hors périmètre). | ✅ fait |
| S8 | Moteur de scène dynamique (jalon 2 de l'éditeur) — `SceneConfig`/`LayerConfig`/`ComponentMount` étendus (pas remplacés) : `placement` par composant (pas par couche), bibliothèque de composants étoffée (Box/Divider/TextLabel/TextList/PollBar/Badge/Image), binding déclaratif, `SceneId` ouvert. 6 sessions atomiques, spec `docs/specs/scene-definition-v2.md`. Pivot demandé par l'owner (2026-07-04) : composer/modifier les composants d'une scène + créer/modifier/supprimer des scènes, modèle Figma. Session 3/6 **terminée** : `TextList` (2 scènes), `Box` (9 couches), `TextLabel`/`Divider` (discussion,
brb, codage, interview, react, creation, fin — labels/valeurs/séparateurs). `className`/`className: ''`
ajoutés à Box/Divider/TextLabel pour réutiliser le CSS existant tel quel (marges, sélecteurs
descendants). Couches non converties (documentées comme exclusions dans chaque config) :
composites à enfants indépendants (interview/cams+fiches), wrappers imbriqués non aplatissables
(codage/cam-mini, react/hud), contrainte d'ordre DOM (starting/message). `bun test` + `bun build`
verts sur tous les fichiers touchés — **vérification visuelle en attente** (owner). Session 4/6
**terminée** (persistance) : `scenes/registry.js` (`loadDynamicScenes()`, `STATIC_SCENE_IDS`),
`scene-runtime.js` (`init()` async, listeners enregistrés avant l'await réseau — fix review),
`dev/scene-data-server.js` (3 routes CRUD dev-only, verrou manifeste en mémoire), `dev/scene-data-format.js`
(logique pure manifeste, testée), `scenes/data/manifest.json` (`[]` initial). Review multi-angles
(8 findings, 6 correctness dont un crash total sur manifeste malformé et une race WS sur l'init async,
2 conventions/reuse) — tous corrigés et reverifiés (`bun test` 115 verts, tests HTTP manuels bout en
bout). Décision owner (2026-07-04) : les 9 scènes existantes migreront à terme vers ce même format
JSON (option B, coût réévalué faible — configs déjà des littéraux purs), aucune protection contre
suppression via les routes génériques (risque accepté, git = filet de sécurité) — voir `docs/inbox.md`.
**Migration des 9 scènes effectuée** (2026-07-04) : `scenes/*.config.js` → `scenes/data/*.scene.json`,
`scenes/registry.js` ne construit plus `SCENE_CONFIGS` par import statique. `*.wire.js` inchangé
(reste du JS statique). Effets de bord corrigés au passage : chemins de `loadDynamicScenes()` rendus
absolus (cassaient depuis `dev/overlay-setting.html`), panneau de placement (S7) mis à jour pour
appeler `loadDynamicScenes()` et son mécanisme d'écriture réécrit en JSON pur (`dev/scene-placement-format.js`,
`dev/placement-server.js`, remplace la réécriture par regex sur source JS). `protocol.test.js` bascule
sur l'import JSON natif Bun. `bun test` : 114/114. **Vérification visuelle OBS/navigateur des 9 scènes
toujours à faire par l'owner** (pas d'outil de screenshot dans cet environnement). Migration `jeu` vers
`AlertBanner`/`PollBar` actée mais différée après S8 (owner, voir `docs/inbox.md`). Session 5/6
**terminée** (2026-07-05, UI de composition) : `dev/overlay-setting.html` étendu — chaque couche liste
ses `ComponentMount` avec formulaire dédié par type (`dev/component-field-schemas.js`, 12 types
composables, `DotGridBackground` exclu), bascule valeur fixe/`$bind` par champ, ajout/retrait
sauvegardent immédiatement (`POST /update-scene`), édition de champ attend le bouton "Enregistrer".
`liveConfig` devient la copie de travail unique (placement + composition) pour éviter qu'une
sauvegarde de composition n'écrase un placement fraîchement glissé-déposé. Gestion des couches et
placement par composant individuel restent hors scope (décision owner, `docs/inbox.md`). Vérifié
bout en bout (flux ajout-composant simulé contre un vrai `scene-data-server`, persistance confirmée
sur disque). `bun test` : 114/114. Session 6/6 **terminée** (2026-07-05, dernière de l'épopée S8) :
création de scène (formulaire id + couche `goldbar` minimale, `POST /create-scene`) et suppression
avec confirmation navigateur (`POST /delete-scene`) ajoutées au panneau. Extension owner au-delà du
texte original de la spec : `/delete-scene` **archive** désormais le fichier
(`scenes/data/archived/<id>.scene.json`) au lieu de le supprimer — récupérable sans passer par git.
Gestion minimale des couches ajoutée (ajouter/supprimer une couche entière, bouton désactivé sur
`goldbar`) pour qu'une scène créée ne reste pas une coquille vide — réutilise `POST /update-scene`
(session 5/6), aucune nouvelle route. Renommage/réordonnancement de couches et placement par
composant individuel restent hors scope. Vérifié bout en bout (création → ajout de couche →
suppression simulés contre un vrai `scene-data-server`, fichier confirmé déplacé vers `archived/`
avec contenu intact). `bun test` : 114/114. **S8 complet (6/6).** Renommage/réordonnancement de
couches ajoutés le jour même (commit `4c2e331`, non retracé ici avant le 2026-07-10, voir
`docs/inbox.md` §Gestion des couches) : input éditable par couche (`goldbar` protégée) + glisser-
déposer par poignée dédiée. Placement par composant individuel reste hors scope. | ✅ fait |
| Épopée | Éditeur complet au-delà de S6/S8 (export/import config, skill recherche graphique) | ⬜ hors scope |
| Track A | Bibliothèque de transitions de scène (`slide`/`wipe`/`morph`) — besoin concret exprimé par l'owner (2026-07-06), sorti de l'épopée. `direction` (slide/wipe) et `color` (wipe) configurables dès la v1. 4 sessions atomiques, spec `docs/specs/scene-transition-library.md`. A1 (spec, 2026-07-06), A2 (`slide`/`wipe`), A3 (`morph` via `DotGridAnimated.morphTo()`, interpolation Simplex entre modes, dégradation en fondu d'opacité si un seul côté a un fond — LAC-01 tranchée) et A4 (UI panneau) **livrées** (2026-07-07, commit `deacfa5`). | ✅ fait (4/4) |
| Track B | Bibliothèque de 11 effets de fond indépendants (élargie depuis le cycle de formes original suite à recherche CodePen, 2026-07-07) — remplacent `DotGridBackground` sur `#bg-layer`, devenu polymorphe (`SceneConfig.background: ComponentMount`). 8 sessions atomiques, spec `docs/specs/background-effects-library.md`. B1 (spec) → B2 (fondation polymorphe, migration `DotGridBackground` sans régression) → B3-B7 (Rain, MatrixGrid, Bubble+éclatement, Fireflies, FloatingSymbols, GeometricPattern, ColorDrops, StarsParallax, OrbitingShapes — chacun avec sa section de fine-tuning dans `dev/overlay-setting.html`) → B8 (`ShapeMorphBackground`, cycle pizza/étoile ninja/casque/carapace/masque Batman par interpolation radiale) **toutes livrées** (2026-07-07, commit `deacfa5`). LAC-01 (renommage panneau) tranchée : conservé tel quel. LAC-02 (variabilité couleur DotGrid par bruit) et LAC-03 (positions procédurales `StarsParallaxBackground`) tranchées avec l'owner (2026-07-10, voir §Durcissement ci-dessous). | ✅ fait (8/8) |
| Couche 4 DotGrid | Réactions visuelles aux alertes stream (`follow`/`sub`/`raid`/`bits`) + déclenchement `ambient` périodique — dernier gap de `HANDOFF_overlay_dotgrid.md` (couche 3 devenue obsolète, remplacée par `ShapeMorphBackground`/Track B). 3 sessions atomiques, spec `docs/specs/dotgrid-event-triggers.md`. Session 1 (spec), 2 (`DotGridAnimated.trigger()`, 4 comportements + minuteur ambient, vérifié visuellement par échantillonnage pixel) et 3 (câblage `applyBackgroundReactions` dans `scene-runtime.js` — pas de fichier wire touché, LAC-01 de la spec : évite une dépendance circulaire) **livrées** (2026-07-10). Vérifié bout en bout via `/emit` réel sur un relais de test (OBS non sollicité). `/code-review` : 2 races mineures (fenêtre de chargement de page) documentées LAC-02 de la spec, acceptées telles quelles (owner). | ✅ fait (3/3) |

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

## Détail S7 (livré, 5/5 sessions)

- `docs/specs/scene-placement-protocol.md` — spec (reviewed) : `Placement = { x, y, width?, height? }`
  en pixels absolus, pas d'ancrage (canvas toujours 1920×1080 fixe, vérifié contre 21 règles CSS
  existantes — un système à 9 points n'aurait apporté aucune valeur).
- `types.js` — `Placement`, `LayerConfig.placement` (optionnel, rétrocompatible).
- `placement-resolve.js` — résolution pure `Placement` → style CSS, testée (4 tests).
- `protocol.js` — `validateSceneConfig` V10 (placement optionnel, x/y finis, width/height positifs
  si fournis), testé (4 tests).
- `scene-runtime.js` — applique le style inline au montage si `layer.placement` présent.
- **9 scènes migrées** (10 couches au total) : `discussion`/`cam`, `jeu`/`cam`, `brb`/`message`+`chat`,
  `codage`/`ide-zone`, `interview`/`subject`, `react`/`source-zone`+`source-credit`+`cam`,
  `creation`/`capture-zone`, `fin`/`cam`. Couches non migrées documentées (wrappers flex, bandes
  stretch `left:0;right:0`, couches composites à enfants indépendants) — hors scope V1.
- `dev/overlay-setting.html` — charge une `SceneConfig` + le template/CSS réel (`fetch(index.html)`,
  DRY), couches migrées affichées en rectangles déplaçables à la souris, boutons Réinitialiser
  (par couche + global) et Sauvegarder.
- `dev/placement-server.js` (`bun dev/placement-server.js`, dev-only, jamais lancé en live) —
  `POST /save-placement` réécrit `scenes/*.config.js`. Logique testée (`scene-placement-format.js`,
  6 tests).
- Rendu visuel identique confirmé par l'owner à chaque étape (preview 1920×1080).
- Correction en cours de route : numérotation S6/S7 clarifiée (S7 = ce panneau, S6 = contrôle OBS
  qui en dépend, pas S5).
- **94 tests verts** au total.

## Guides (docs/guides/)

Documentation utilisateur, distincte des specs (specs = décisions techniques validées pour une
session ; guides = comment utiliser/étendre l'outil au quotidien) :

- `utiliser-le-panneau.md` — tweaker/composer une scène depuis `dev/overlay-setting.html` sans écrire de code.
- `creer-un-composant.md` — écrire un nouveau composant/effet de fond from scratch (squelette, checklist de fichiers, leçons de perf).
- `harmoniser-scenes-obs.md` — faire correspondre tes noms de scènes OBS réels aux scènes overlay (panneau §OBS "Renommer les scènes OBS", `relay/obs-scene-map-data.js`).

## Reste à faire (hors S1, déjà identifié)

- ~~Couches 3 et 4 du DotGrid~~ — Couche 3 (morphisme SDF/bitmap) jugée obsolète (remplacée par
  `ShapeMorphBackground`, Track B), Couche 4 (événements stream) livrée le 2026-07-10 (voir
  `docs/specs/dotgrid-event-triggers.md`).
- Intégration Twitch EventSub/chat réelle qui appellerait `/emit` (hors scope S4, voir `docs/specs/relay-bun-s4.md` §Périmètre Exclu).
- Scènes OBS manquantes pour `interview`/`react`/`creation`/`fin` (créer les scènes côté OBS) —
  le mapping des noms est désormais éditable sans toucher au code, voir `docs/guides/harmoniser-scenes-obs.md`.
- ~~Persistance des paramètres `dotgrid-tuner`~~ — résolue en S5 (`dev/tuner-server.js`), voir §Détail S5.
