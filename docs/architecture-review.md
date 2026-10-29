---
created: 2026-10-29
updated: 2026-10-29
---

# Revue d'architecture — vers le Studio d'overlays

Revue **en lecture seule** du code actuel, menée contre le cadrage
[`specs/studio-cadrage.md`](specs/studio-cadrage.md). Elle ne modifie aucun code. Vocabulaire du skill
`codebase-design` : *module*, *interface*, *profondeur*, *seam*, *adapter*, *leverage*, *locality*.

> Une proposition ci-dessous n'est pas une décision. Les choix qui reviennent à l'owner sont
> regroupés en §6.

## 0. Constats urgents (hors architecture, trouvés à la lecture, mesurés le 2026-10-29)

Deux défauts **indépendants du Studio**, à traiter avant le prochain live. Détail et preuves en
annexe (§8, lots 3 et 4).

**U1 — Exposition réseau du mot de passe OBS (sécurité). Corrigé le 2026-10-29** (écoute `127.0.0.1`, liste blanche de fichiers, `dev/local-access-policy.js`, tests `local-access-policy.test.js` ; après correctif : `/.env`, `/.git/config`, `/dev/data/…` → 404, `netstat` : `127.0.0.1` seulement). Constat avant correctif, mesuré sur la machine, serveurs lancés :

| Mesure | Résultat |
|---|---|
| Interface d'écoute des deux serveurs (`netstat`) | `0.0.0.0` et `[::]` : **toutes les interfaces**, pas seulement `localhost` |
| `GET /.env` sur le serveur statique (port 5931) | **HTTP 200, 154 octets**. Le fichier contient une ligne `OBS_WS_PASSWORD` renseignée |
| `GET /.git/config`, `/dev/data/background-state.json`, `/src-tauri/Cargo.toml` | HTTP 200 chacun |
| Pare-feu Windows (`Get-NetFirewallProfile`) | **Désactivé** sur Domaine, Privé et Public ; aucune règle pour `bun.exe` ni pour les ports 5931/5932 |

Cause : `dev/static-server.js` sert `ROOT = ..` (**toute la racine du dépôt**, dotfiles compris) et
`Bun.serve({ port })` n'indique aucun `hostname`. Tant que `start-stream.bat` tourne, **tout appareil
du même réseau local** peut lire `http://<IP du PC>:5931/.env`. Le mot de passe donne accès à OBS
WebSocket, qui, d'après le protocole v5 (non vérifié ici), permet de piloter OBS et de lire les
paramètres du service de diffusion, **clé de stream comprise**. Je n'ai pas lu ni affiché le contenu
du `.env` : seuls des codes de réponse et des tailles ont été relevés. Je n'ai pas vérifié l'existence
d'un pare-feu tiers. Je ne sais pas si quelqu'un a déjà accédé à ce fichier.

Correctif proposé (petit, sur accord) : écouter sur `127.0.0.1` ; servir par **liste blanche** de
chemins (`background.html`, `components/`, modules racine utiles, `dev/` hors `data/`), jamais les
fichiers dont le nom commence par `.`, ni `src-tauri/`, `docs/`, `dev/data/` ; test rouge puis vert.
Mesure à rejouer après correctif. En attendant : ne pas lancer `start-stream.bat` sur un réseau
partagé ; si les serveurs ont tourné sur un réseau non maîtrisé, **changer le mot de passe OBS**.

**U2 — Le serveur d'état accepte n'importe quelle origine (sécurité). Corrigé le 2026-10-29** (Origin et Host locaux exigés, WebSockets compris ; test rouge vu sans la garde). Constat avant correctif : Une requête `OPTIONS` avec une
origine étrangère reçoit `204` et `Access-Control-Allow-Origin: *`. Toute page web ouverte dans votre
navigateur peut donc appeler `POST /state`, `/branding`, `/delete-preset`, `/event` sur
`localhost:5932` : changer le texte du branding **à l'antenne**, supprimer des presets, déclencher des
alertes. Aucune authentification, aucun contrôle d'`Origin`, y compris sur les WebSockets. Le document
`docs/security.md` décrit encore le relais archivé (jetons, limiteur de débit) et **ne couvre pas**
l'architecture actuelle.

**U3 — Perte de données à l'import de presets (corrigé le 2026-10-29, copie structurelle + tests rouge→vert)** : voir B1 (§8). Un import retire `transition` et
`showBranding` de tous les presets existants.

## 1. Méthode et limites

**Mesuré** (commandes reproductibles, aucune estimation) :

- graphe d'imports d'exécution (`from '...'`) des 70 modules JS source non-test (script jetable, hors dépôt) ;
- lignes, exports et importeurs par module ;
- comptage ciblé par `grep` des primitives dupliquées dans les effets et des lectures de paramètres d'URL ;
- **première passe** : lecture intégrale de 8 modules du noyau et lecture de la structure de quelques
  autres ;
- **deuxième passe** (annexe §8) : lecture du reste, par lots, avec des exécutions pour prouver chaque
  défaut annoncé (aller-retour d'export/import, calcul des sauts de position, rejeu de la sauvegarde
  DotGrid, mesures `netstat`/`curl`, parcours du vrai tuner dans un navigateur à 1920×1080).

**Couverture de lecture, mesurée (état final, 2026-10-29)** : sur 9 688 lignes de JS source
(70 modules), **71,6 %** ont été lues en entier avec leurs commentaires (40 modules), **23,6 %** lues
**sans leurs commentaires** (27 modules, surtout contrôleurs et utilitaires de petite taille), **4,8 %**
lues en partie (3 modules : le reste du contrôle pré-live, la fin de `start-stream.js`, les tables de
Simplex). **Plus aucun module JS n'est resté fermé.**

*Historique : la première version de ce document reposait sur 7,6 % de lecture. Les constats F1 à F8
étaient des mesures structurelles ; l'annexe (§8) les confirme, en corrige certains et en ajoute.*

**Toujours non lu** : les **fichiers de test** (4 767 lignes, 50 fichiers : leur qualité n'est pas
évaluée), le HTML du tuner (`background-tuner.html`, 641 lignes, lu par extraits et par `grep`) et
`dotgrid-tuner.html`. Aucun profilage de performance n'a été fait dans OBS.

Taille : 9 688 lignes de JS source (70 modules), 10 875 avec le HTML, pour 4 767 lignes de tests
(50 fichiers, 373 tests verts).

## 2. Ce qui est sain et à conserver

| Élément | Pourquoi |
|---|---|
| Le moteur de rendu partagé | `background-mount.js` est importé par **quatre** consommateurs réels (`background.html`, l'aperçu du tuner, les vignettes, le contrôle pré-live). C'est un vrai seam : l'aperçu et OBS rendent par le même code |
| Injection dans le montage | `createBackgroundMount(container, { registry, createLayer, scheduleFrame, scheduleTimeout })` : le cycle de vie se teste sans DOM. Bonne forme d'interface testable |
| Modules purs de format | `branding-format.js`, `background-transition.js`, `obs-scene-mapping.js` : zéro import, testés, sans effet de bord |
| `ports.config.js` | Source unique des ports, importée par dix modules |
| Contrôleurs du Studio | Reçoivent leurs éléments en paramètres (une seule fonction du runtime résout 50 identifiants), donc testables |
| Contrat de composant | `{ el, update?, destroy? }` stable et déjà respecté par tous les effets |

**Conclusion, après lecture de l'ensemble du JS** : la logique existante est de bonne facture (pureté,
injection de dépendances, décisions commentées, validation stricte), mais l'**enveloppe** est à
refaire : cycle de vie d'effet recopié, montage à emplacement unique, serveur monolithique, Studio
impératif. Je recommande donc de **migrer par étapes autour de la logique existante** plutôt que de
réécrire à partir de zéro. Précision : l'étape 2 (`defineCanvasLayer`) touche **chacun** des effets ;
en pratique l'enveloppe de chaque effet est réécrite et seule sa logique de dessin est conservée.

Cette conclusion reste **une recommandation raisonnée, pas une preuve** : elle ne porte ni sur la
qualité des tests, ni sur la performance mesurée dans OBS. La lecture a aussi trouvé **plusieurs défauts
réels** que la première passe ne voyait pas (§9) : le code n'est pas « sain » partout.

## 3. Constats

Gravité exprimée par rapport au cadrage du Studio (scènes en couches, timeline visée, stabilité du
live d'abord), pas dans l'absolu.

### F1 — Le squelette d'animation est recopié dans chaque effet (élevée)

Mesuré sur les neuf effets canvas : **chacun** contient sa propre boucle `requestAnimationFrame`
(2 occurrences : demande et annulation), son propre `ResizeObserver` (1) et sa propre gestion du
ratio de pixels (`canvasPixelRatio`, 2). `ReactionOverlay.js` fait de même. Les helpers
`canvas-runtime.js` (17 lignes, 11 importeurs) et `animation-time.js` (32 lignes, 5 importeurs)
mutualisent des *fonctions*, pas le *cycle de vie*.

Quatre effets (`StarsParallax`, `OrbitingShapes`, `ShapeMorph`, `WaterRipple`) n'utilisent pas
`frameDeltaSeconds` ; leur gestion du temps n'a pas été lue, mais elle **n'est pas** celle des cinq
autres.

Conséquences pour le Studio :

- **Stabilité** : avec N couches animées, N boucles `requestAnimationFrame` indépendantes, sans
  budget commun ni point où dégrader. Un seul planificateur permettrait de limiter, mettre en pause
  ou isoler une couche défaillante.
- **Timeline** : aucune horloge commune. Une timeline à images clés exige un temps unique, injectable
  et pilotable (pause, saut, ralenti).
- **Maintenance** : toute évolution du cycle de vie (pause, qualité, budget) se répète dix fois.

### F2 — Le montage est à emplacement unique, et porte des politiques qui n'y ont pas leur place (élevée)

`createBackgroundMount` gère **un** effet monté plus une liste de calques sortants le temps d'une
transition. Une scène en couches demande N calques simultanés avec ordre, visibilité et transitions
propres : ce module doit devenir une *pile*, pas être étendu.

Il embarque aussi trois politiques sans rapport avec le montage :

- **Audio** : `isAudioReactive()` / `applyAudio()` détectent la capacité par `typeof instance.setAudioLevel
  === 'function'`.
- **Réactions** : `react()` détecte `trigger` de la même façon.
- **Contrat implicite** : `setAudioLevel` est implémenté par les neuf effets canvas mais **absent de la
  définition `ComponentInstance`** de `types.js` (qui liste `update`, `morphTo`, `destroy`, `trigger`).
  Le contrat réel dépasse le contrat écrit.

Enfin `AUDIO_REACTIVE_ON = 'Oui'` : la valeur persistée du champ `audioReactive` est **le libellé
affiché** (`"Oui"` / `"Non"` dans votre état). Un libellé d'interface sert de donnée ; le renommer,
ou traduire l'outil, casse les presets enregistrés.

### F3 — Le contrat d'URL de la page de rendu n'a pas de module (moyenne)

Les paramètres `preset`, `branding`, `transparent`, `quality` sont **lus à quatre endroits** et
**construits à un autre** :

| Lieu | Rôle |
|---|---|
| `background.html` | lit `preset`, `branding`, `transparent` |
| `components/canvas-runtime.js` | lit `quality` dans `location.search` (global implicite) |
| `dev/background-preview-controller.js` | lit et écrit `quality` |
| `background-selection.js` | construit les URL (`preset`, `transparent`, `quality`) |

Un effet dépend donc de l'URL de la page, ce qui est un couplage caché : le Studio verra plusieurs
aperçus dans une même page, avec des qualités différentes.

### F4 — Un effet se déclare à trois endroits, et des tests compensent (moyenne)

Ajouter un effet = `component-names.js` + `component-registry.js` + `dev/component-field-schemas.js`
(le guide dit « trois lignes », et « les tests de cohérence attrapent les oublis »). Une structure qui
exige des tests pour ne pas se désynchroniser est un signal : la *définition d'un effet* est un seul
concept éclaté en trois fichiers. S'y ajoutent les capacités (audio, réaction native) déclarées
nulle part.

### F5 — Le serveur d'état cumule quatre responsabilités (moyenne)

`dev/background-state-server.js` (495 lignes, aucun export) contient : le transport HTTP/WebSocket,
la persistance avec verrou, **douze** handlers de domaine (presets, import, branding, événements,
mapping de scènes) et le client OBS. Il porte un état mutable de module (`obsStatus`) et lit
l'environnement. La logique de domaine est en partie extraite (`background-preset-library.js`,
`background-state-format.js`), ce qui sauve la testabilité, mais la composition reste un point unique.

`background.html` appelle en outre ce serveur par `fetch` et `WebSocket` **directs**, hors du client
`background-state-client.js` utilisé par le Studio : deux voies pour un même protocole.

### F6 — La couche Studio ne passera pas à l'échelle d'un éditeur de couches (élevée pour le cadrage)

- DOM câblé par **identifiants** : 50 `getElementById` dans le runtime, un contrat implicite avec
  `background-tuner.html`.
- `background-tuner.html` : 641 lignes dont environ 450 de CSS inline.
- **Connaissance dupliquée** : les bornes du branding existent dans `branding-format.js` *et* dans les
  attributs `min`/`max` du HTML. Je l'ai constaté en changeant la référence à 1080p : il a fallu
  modifier les deux, et rien ne les lie.
- Aucun modèle d'édition : pas de document de scène, pas d'état d'édition unique, pas de sélection,
  d'annulation ni de manipulation directe. Seul le branding se déplace à la souris (`branding-drag.js`,
  32 lignes).
- Le dossier `dev/` abrite le produit (Studio, serveur d'état), pas seulement de l'outillage.

### F7 — Petits modules : suppression utile ou non (faible)

Test de suppression appliqué :

| Module | Résultat |
|---|---|
| `background-reactions.js` (22 lignes) | **Pass-through** : un seul `if` (réaction native sinon overlay), dupliqué dans deux appelants si on le supprime. La politique appartient au système de couches, pas à un module à part |
| `background-selection.js` (50 lignes) | **Deux concepts sans lien** : résoudre un fond depuis l'état, et construire des URL. Le second relève de F3 |
| `canvas-runtime.js`, `animation-time.js` | Gagnent leur place (11 et 5 importeurs) mais appartiennent au futur service de temps et de rendu (F1) |
| `keyed-lock.js`, `dev-server-shared.js`, `port-check.js` | Petits, cohérents, utiles |

### F8 — Organisation et dette ponctuelle (faible)

- 14 fichiers à plat à la racine, 41 dans `dev/`, 18 dans `components/` : aucune séparation par
  couche, malgré une séparation de fait (moteur / protocole / serveur / Studio).
- `DotGridAnimated.js` : **708 lignes**, le double de tout autre effet, exposé sous le nom
  `DotGridBackground` (alias dans le registre), avec un outil de réglage historique
  (`dotgrid-tuner.html` + `tuner-server.js`) qui **réécrit du code source**. Candidat au retrait.
- Typage : des `// @ts-check` partout, mais **aucun** `tsconfig.json`, `jsconfig.json` ni
  `package.json` à la racine. Les annotations ne sont vérifiées que dans l'éditeur ; rien ne les
  contrôle à l'exécution des tests.

## 4. Architecture cible proposée

Proposition, à valider (§6). Quatre couches, dont les dépendances ne vont que dans un sens :
**protocole ← moteur ← hôte et Studio**, les adaptateurs se branchant sur l'hôte.

```text
protocol/   Formats partagés, purs, sans DOM ni serveur
engine/     Rendu : scène, couches, horloge, transitions
host/       Processus local (futur exécutable) : transport, stockage, adaptateurs
studio/     Interface de création : éditeur de scène, formulaires, brouillon/publication
```

### 4.1 `protocol/` — un seul endroit pour ce que tout le monde doit savoir

- **Document de scène** (`SceneDoc`, versionné) : pile ordonnée de couches `{ id, kind, options,
  placement, visible, enter?, exit? }`. Les propriétés sont **adressables** (chemin) et
  **sérialisables**, pour accueillir la timeline.
- **Contrat d'URL** : un module qui lit *et* construit (`preset`, `scene`, `branding`, `transparent`,
  `quality`). Corrige F3.
- Formats existants regroupés : état, presets, branding, événement `{ type, username?, amount? }`.
  Validation et migration au même endroit (`dev/background-state-format.js` aujourd'hui).
- **Valeurs persistées neutres** : `audioReactive` devient un booléen, le libellé « Oui » reste dans
  l'interface. Corrige F2 (avec migration).

### 4.2 `engine/` — modules profonds

| Module | Interface (petite) | Ce qu'il cache | Corrige |
|---|---|---|---|
| `createSceneRuntime(container, deps)` | `apply(sceneDoc)`, `emit(event)`, `setPaused`, `destroy` | Pile de couches, cycle de vie, transitions, routage d'événements, alimentation audio | F2 |
| `Clock` / contexte de rendu | `subscribe(fn)`, `pause()`, `setQuality()` ; injecté, jamais lu dans l'URL | **Une** boucle d'animation, ratio de pixels, delta borné, budget, isolement d'une couche qui lève | F1, F3 |
| `defineCanvasLayer({ draw, ... })` | Un effet fournit `draw(ctx, dt, size)` | Canvas, `ResizeObserver`, DPR, boucle, pause, destruction | F1 |
| `LayerKind` | `{ id, create, schema, defaults, capabilities }` | Définition unique d'un type de couche : fabrique, formulaire, capacités **déclarées** (`audio`, `events`) | F2, F4 |
| Transitions | Existant (`background-transition.js`), généralisé à une couche | Interpolation fondu/balayage ; emplacements `enter`/`exit` | — |

Un seul `LayerKind` remplace les trois déclarations de F4 ; la détection par `typeof` de F2 disparaît
au profit de capacités déclarées. Les tests de cohérence actuels deviennent inutiles (le type rend
l'oubli impossible), ce qui est le test de profondeur voulu.

### 4.3 `host/` — le processus local

- **Transport** (HTTP/WS) mince : il route, il ne décide rien. C'est le seam de la spec
  zéro-installation. *Un seul adaptateur réel + un faux en mémoire pour les tests : seam justifié par
  la testabilité ; le deuxième adaptateur réel (cloud) reste optionnel.*
- **Stockage** : documents de scène, presets, état, **versions brouillon / publiée** avec retour
  arrière. Persistance avec verrou (existant) derrière une interface.
- **Adaptateurs de sources**, un module chacun, qui produisent le contrat commun :
  - *événements* : boutons de test, Twitch EventSub, Twitchat (écoute OBS WebSocket) ;
  - *données* (widgets) : lecteurs avec cache local et repli hors ligne ;
  - *scène OBS* : lecture seule (existant : `obs-scene-client.js`, `obs-scene-mapping.js`).
- Ici deux adaptateurs réels existent déjà ou sont décidés pour les événements : le seam est réel.

### 4.4 `studio/` — l'éditeur

- **Un état d'édition unique** : le `SceneDoc` brouillon, avec abonnement, sélection et annulation.
  Tout panneau en dérive.
- Panneaux : liste de couches (ordre, visibilité, verrou), aperçu fidèle 1920×1080 avec manipulation
  directe (déplacer, redimensionner), formulaires **générés par schéma** (existant, à conserver),
  barre brouillon/publication. Timeline plus tard.
- Approche d'interface : voir décision D1.

### 4.5 Arborescence proposée

```text
protocol/   scene-doc.js  url-contract.js  event.js  state-format.js  branding.js  ...
engine/     scene-runtime.js  clock.js  canvas-layer.js  transitions.js
            layers/  rain.js  bubble.js  ...  decor/  media/  widgets/
host/       server.js  transport.js  store.js
            adapters/  events-eventsub.js  events-twitchat.js  obs-scene.js  data-*.js
studio/     index.html  editor/  panels/  schema-form/
render.html   (anciennement background.html)
```

## 5. Chemin de migration

Chaque étape garde la suite de tests verte, et se livre en commits séparés (règle « un seul fil »).
Les étapes 2 à 4 touchent des surfaces partagées (`CLAUDE.md` : `component-registry.js`,
`component-names.js`, schémas) : vérification en aval avant édition.

| # | Étape | Risque | Garde |
|---|---|---|---|
| 0 | **Prérequis** : QA OBS 1080p (`docs/inbox.md`) | — | Base validée avant de refactoriser |
| 1 | Contrat d'URL + interface de transport (phase 1 de la spec zéro-installation) | Faible | Tests existants + test de contrat |
| 2 | `Clock` + `defineCanvasLayer` ; migration des effets **un par un** | **Moyen** : régression visuelle | Sonde de pixels (avec cas rouge vu) + contrôle visuel de l'owner par effet |
| 3 | `LayerKind` : fusion noms/registre/schéma ; capacités déclarées ; valeurs persistées neutres | Moyen : migration des presets | Aller-retour d'export/import des presets |
| 4 | `SceneDoc` v1 + `createSceneRuntime` ; les presets existants deviennent des scènes à une couche | Moyen | Équivalence de rendu preset ↔ scène mono-couche |
| 5 | Décomposition du serveur ; brouillon/publication | Moyen | Tests d'intégration existants (`background-state-server.test.js`) |
| 6 | Studio : état d'édition + éditeur de couches, par panneau | Faible à moyen | Tests des contrôleurs |
| 7 | Nouveaux types de couches (décor → médias → widgets), adaptateurs de sources | Variable | Un type à la fois |
| 8 | Timeline | Élevé | Horloge injectable en place depuis l'étape 2 |

Les étapes 1 et 2 sont **indépendantes du reste** : elles apportent seules un gain (stabilité,
maintenance) même si le Studio n'était jamais livré.

Retrait à planifier : `dotgrid-tuner.html`, `tuner-server.js`, `dotgrid-params-format.js`, ainsi que
le relais mort du contrôle pré-live (voir `revue-fonctions.md`).

## 6. Décisions qui reviennent à l'owner

**Réponses de l'owner (2026-10-29)** :

| | Réponse |
|---|---|
| D1 | **Web Components natifs** + petit magasin d'état, sans dépendance |
| D2 | **Renommage accepté.** À confirmer : garder `background.html` comme alias le temps de la transition, pour ne pas casser la Browser Source |
| D3 | **Valeurs persistées neutres acceptées** (migration des presets, avec sauvegarde) |
| D4 | **Oui** (retrait du tuner DotGrid historique, `tuner-server.js` et `dotgrid-params-format.js`, avec tag git ; pas encore exécuté) |
| D5 | **Typage réel et effectif demandé.** Introduit un outil de développement (compilateur de types) ; `CLAUDE.md` §1 interdit aujourd'hui tout `npm install` : amender pour distinguer dépendance d'exécution (interdite) et outil de développement (autorisé) |
| D6 | **Étape « horloge unique » juste après le QA**, acceptée |

Détail des options :


- **D1 — Approche de l'interface du Studio.** Le projet interdit les dépendances et le build. Un
  éditeur riche (liste réordonnable, manipulation directe, plus tard timeline) en DOM impératif câblé
  par identifiants, comme aujourd'hui, devient ingérable. Options : **(a)** *Web Components natifs* +
  un petit magasin d'état à abonnement, sans dépendance, conforme à la contrainte ; **(b)** garder les
  contrôleurs impératifs actuels et les étendre ; **(c)** relâcher la contrainte pour une bibliothèque
  d'interface, ce qui contredit `CLAUDE.md` §1. *Recommandation : (a).*
- **D2 — Renommage et déplacement** (`dev/` → `studio/` + `host/`, racine → `engine/` + `protocol/`,
  `background.html` → `render.html`). Les URL de vos Browser Sources changeraient (`background.html`),
  sauf à conserver une redirection. À arbitrer : renommer, ou garder `background.html` comme alias.
- **D3 — Valeurs persistées neutres** (`audioReactive` booléen) : demande une migration de vos presets.
  *Recommandation : oui, avec sauvegarde et aller-retour vérifié.*
- **D4 — Retrait de DotGrid historique** (tuner + serveur d'écriture), avec tag git. *Recommandation :
  oui.*
- **D5 — Typage réel** : ajouter un `jsconfig.json` et une vérification `tsc` à l'exécution des tests
  introduit un outil de développement (pas une dépendance d'exécution). *Recommandation : l'étudier,
  car aujourd'hui `@ts-check` ne protège rien en CI.*
- **D6 — Étape 2 d'abord ?** Le gain de stabilité (horloge unique) est indépendant du Studio et
  rentable seul. *Recommandation : oui, juste après le QA.*

## 7. Ce que cette revue ne couvre pas

- l'intérieur des effets et de l'audio, la bibliothèque de presets, l'import, les vignettes ;
- la performance mesurée (aucun profilage dans OBS) : F1 décrit une structure, pas une lenteur observée ;
- le format détaillé de `SceneDoc` et de la timeline : spec technique à écrire après validation de ce
  document.

## 8. Annexe — lecture complète du code restant (2026-10-29, en cours)

Suite à la demande de l'owner de lire les 81 % non ouverts. Chaque lot est consigné ici dès sa lecture.
Légende : **[lu]** observé dans le code ; **[calcul]** déduit d'une formule lue puis calculé, **non
observé dans OBS**.

### Lot 1 — les neuf effets non-DotGrid, `audio-reaction.js`

Lus en entier : Rain, Bubble, ColorDrops, Fireflies, FloatingSymbols, StarsParallax, OrbitingShapes,
WaterRipple, GeometricPattern, `audio-reaction.js`.

**A1. L'enveloppe est bien recopiée à l'identique [lu].** Dans les huit effets canvas lus, les blocs
`handleResize`, `tick` (début), `ResizeObserver` et `destroy` sont les mêmes, à la ligne près. F1 est
confirmé par lecture, plus seulement par comptage.

**A2. Politique de temps incohérente, avec un défaut visible [lu + calcul].**

| Effet | Gestion du temps |
|---|---|
| Rain, ColorDrops, FloatingSymbols, WaterRipple | **Temps intégré** (`y += vy × facteur × delta`) : un changement de vitesse ou d'audio ne fait pas sauter la position |
| StarsParallax, OrbitingShapes, Fireflies, Bubble (dérive latérale) | **Position = temps absolu × facteur** (`timestamp × speed × boost`). Quand le facteur change, la position **saute** |

Calcul (formules recopiées de `StarsParallaxBackground.js:73` et `OrbitingShapesBackground.js:106-110`,
facteur audio passant de 1,00 à 1,05 entre deux images) :

| Durée de fonctionnement | StarsParallax : saut d'une étoile | OrbitingShapes : saut d'angle |
|---|---|---|
| 10 s | 10 px | 0,04 tour |
| 1 min | 60 px | 0,26 tour |
| 10 min | 480 px (sur 1 080) | 2,6 tours |
| 30 min | 360 px (borné par le bouclage) | 7,9 tours |

Avec la réactivité audio désactivée, le facteur vaut 1 en permanence et rien ne saute. Avec le son
activé, le facteur varie à chaque image et **le défaut s'aggrave avec la durée du stream**. Le
même défaut se produit quand on déplace le curseur de vitesse dans le tuner. À confirmer dans OBS
(voir QA court). Il rejoint la justification d'une **horloge unique à temps intégré** (F1).

**A3. Audio : trois façons de faire coexistent [lu].** Sept effets utilisent `createAudioReaction`.
`BubbleBackground` et `WaterRippleBackground` réimplémentent la même logique à la main (niveau borné,
détection de pic, remise à zéro). `GeometricPattern` pilote `playbackRate` et l'opacité.

**A4. Le libellé « Oui » est codé en dur dans cinq fichiers de code [lu]** (`background-mount.js`,
`audio-reaction.js`, `BubbleBackground.js`, `WaterRippleBackground.js`, `DotGridAnimated.js`), alors que
la constante `AUDIO_REACTIVE_ON` existe et n'est utilisée que par `background-mount.js`. Les listes
`choices: ['Non', 'Oui']` sont aussi recopiées onze fois dans `component-field-schemas.js`. Confirme
F2 et D3 (valeurs persistées neutres).

**A5. Toutes les couches ne sont pas des canvas [lu].** `GeometricPattern` est un `<div>` animé par
la Web Animations API (horloge propre au navigateur). Le futur `defineCanvasLayer` ne peut donc pas
être le seul contrat : le service de temps doit aussi savoir **piloter une animation du navigateur**
(pause, vitesse) pour les couches non-canvas.

**A6. Pas d'isolement d'erreur [lu].** Dans chaque `tick`, la prochaine image est demandée **avant**
le dessin : une exception dans le dessin se répète à chaque image sans arrêter la boucle (bruit
console, pas d'arrêt de la couche). Un planificateur commun pourrait isoler ou couper la couche fautive.

**A7. Doublons mineurs [lu].** `WaterRippleBackground` recalcule son delta à la main (`rawDelta`) au lieu
d'appeler `frameDeltaSeconds` ; `clamp` est redéfini localement dans plusieurs effets.

### Lot 2 — DotGrid, ShapeMorph, audio

Lus en entier : `DotGridAnimated.js`, `ShapeMorphBackground.js`, `background-audio.js`, `audio-levels.js`.

**A8. Le sélecteur « mode » de DotGrid est un leurre [lu + mesuré].** `MODE_PARAMS` déclare **8
modes** (`discussion`, `codage`, `brb`, `interview`, `react`, `creation`, `fin`, `starting`) : mesuré,
ils portent **une seule valeur distincte** (`freqX 0.045, freqY 0.045, freqT 0.79, amplitude 0.16`).
`GRID_MODES` alimente pourtant le champ « mode » du tuner (`dev/component-field-schemas.js:106`) : le
Studio propose huit choix qui ne changent **rien**. Ce sont des vestiges des scènes du moteur archivé.
À retirer ou à remplacer par des modes réels : candidat direct à votre confusion sur les fonctions.

**A9. DotGrid porte du code mort [lu + `grep`].** Sans autre appelant que ses propres tests ou le
tuner DotGrid historique : `morphTo` (aucun appelant), `setMode` (seulement `dotgrid-tuner.html`),
`computeAmbientDelay` (définie et exportée, **non appelée** par `scheduleAutoReaction`, qui utilise
`reactionInterval`), `lerpModeParams`, `degToLUTIndex` hors tests. `MODE_PARAMS` est exporté **mutable**
« pour le tuner », qui le modifie directement. Le fichier fait 708 lignes parce qu'il superpose quatre
choses : l'effet, un système de modes hérité, des réactions d'alerte (minuteur `ambient` compris) et
l'audio.

**A10. Couplage entre effets [lu].** `ShapeMorphBackground` importe `easeProgress` depuis
`DotGridAnimated.js` : un effet charge un autre effet (708 lignes plus le bruit de Simplex) pour une
fonction d'easing. Une deuxième implémentation d'easing existe côté CSS (`cssEasing`,
`background-transition.js`).

**A11. Le défaut de temps absolu touche six effets, pas quatre [lu].** S'ajoutent à la liste de A2
`ShapeMorph` (`rotation = … timestamp × rotationSpeed × boost`) et `DotGrid` (`t × speeds[i] ×
pulseSpeed`, ici déclenché par le curseur seulement, sans audio). Intègrent correctement le temps :
Rain, ColorDrops, FloatingSymbols, WaterRipple.

**A12. Boucle de dessin de DotGrid : point chaud probable [lu, non mesuré].** À 1920×1080 avec
`spacing: 20`, la grille compte 96 × 54 = **5 184 points**, chacun avec un `fillStyle` reconstruit en
chaîne, un `arc` et un `fill` par image ; deux évaluations de bruit de Simplex par point en mode
`noise`. Candidat à une optimisation (regroupement par palier d'opacité, sprite précalculé comme pour
`glow`), **après mesure** dans OBS : non profilé ici.

**A13. `background-audio.js` est un bon module [lu].** Une interface minuscule (`sync()`,
`handleStreamLost()`, `getState()`, `destroy()`), des dépendances injectées (micro, planificateur,
temporisation), une reconnexion à reculs, le micro ouvert **seulement** si un effet réactif est monté.
À conserver tel quel. Il couple en revanche son interface à celle du montage
(`isAudioReactive` / `applyAudio`) et possède **sa propre boucle `requestAnimationFrame`** : dans
l'architecture cible, il devient un abonné de l'horloge unique.
`audio-levels.js` est pur et bien testable ; ses constantes de lissage (`ATTACK 0.5`, `RELEASE 0.08`)
s'appliquent **par appel**, donc la durée de retombée dépend de la cadence d'images (contrairement aux
effets à temps intégré). Défaut mineur.

### Lot 3 — protocole : état, presets, transitions, schémas de champs

Lus en entier : `dev/background-state-format.js`, `dev/background-preset-library.js`,
`background-transition.js`, `dev/component-field-schemas.js`.

**B1. DÉFAUT CONFIRMÉ — l'export/import de presets perd des données [lu + exécuté].**
`clonePreset` (`dev/background-preset-library.js:66`) copie par **liste blanche** `id, name,
component, options, tags` et **omet `transition` et `showBranding`**, deux champs ajoutés au type
`BackgroundPreset` par les specs ④ et ⑤. Exécuté sur le vrai code avec un preset qui porte les deux :

| Étape | `transition` | `showBranding` |
|---|---|---|
| Preset d'origine | présent | `false` |
| Après export (bundle) | **perdu** | **perdu** |
| Après réimport (parse) | **perdu** | **perdu** |
| Existant après fusion (`mergeBackgroundPresetImport`) | **perdu** | **perdu** |

Aggravant : `handleImportPresets` écrit `{ ...file, presets: merged.presets }`, où `merged.presets`
commence par `existing.map(clonePreset)`. **Tout import retire donc ces deux champs de tous les
presets déjà présents**, pas seulement de ceux importés. `grep` ne trouve **aucun test** de
`transition` ou `showBranding` dans `background-preset-library.test.js`.
Conséquences : (a) le filet de sécurité que la spec zéro-installation et D3 prévoient (« aller-retour
d'export/import vérifié ») **n'est pas fiable en l'état** ; (b) un utilisateur qui exporte puis importe
perd ses transitions et ses réglages de branding par preset. Cause racine : copie par liste blanche au
lieu d'une copie qui préserve tous les champs. Correctif prêt, à appliquer sur accord (test rouge
d'abord, puis copie structurelle, puis garde sur l'ensemble des clés pour la classe de défaut).
Impact actuel sur vous : faible (un seul preset), mais réel dès que vous en utiliserez davantage.

**B2. Le protocole dépend de l'interface et d'un effet [lu].** `dev/background-state-format.js` (validation
de l'état persisté, côté serveur) importe `BACKGROUND_COMPONENT_NAMES` depuis
`dev/component-field-schemas.js` (configuration du formulaire du tuner), qui importe lui-même
`GRID_MODES` depuis `components/DotGridAnimated.js` (un effet de rendu). La validation d'un fichier
d'état exige donc de charger la configuration d'interface **et** un effet : la dépendance va du
protocole vers l'interface, puis vers le rendu, **à l'envers** de la structure voulue (§4).

**B3. Quatre listes de noms d'effets, dont une « source unique » qui ne l'est pas [lu].**
`component-names.js` s'annonce « source unique » et dit être consommée par
`dev/component-field-schemas.js`. Or ce dernier **ne l'importe pas** : il dérive sa liste de ses
propres clés (`BACKGROUND_COMPONENT_NAMES = Object.keys(BACKGROUND_FIELD_SCHEMAS)`). La validation
d'état utilise cette liste-là, le montage utilise `component-registry.js`. Confirme F4 et corrige
sa formulation : ce n'est pas « trois fichiers à tenir à jour », c'est **un commentaire qui affirme une
dépendance inexistante**, donc une garantie de cohérence qui repose uniquement sur des tests.

**B4. Les bornes d'options ne sont définies nulle part de façon unique [lu].** Trois endroits les
connaissent : la table `NUMBER_FIELD_GUIDANCE` du tuner (indexée par **nom de champ**, donc partagée
entre effets : `size` vaut 20–240 pour la cellule de GeometricPattern comme pour le rayon de
ShapeMorph), les `clamp` ad hoc dans chaque effet, et **la validation d'état, qui ne vérifie pas du
tout les valeurs d'options** (`options : objet attendu`). Une valeur hors bornes écrite par une autre
version passe la validation. Avec `LayerKind` (§4.2), le schéma devient l'unique source pour
l'interface, la validation et le bornage.

**B5. Le couple `audioReactive` / `audioIntensity` est recopié onze fois [lu].** Même bloc, même
description de 150 caractères, dans chaque effet. C'est une *capacité* (« réagit au son ») déclarée
dans l'effet par copier-coller ; en `LayerKind`, elle serait déclarée une fois et ajouterait ses deux
champs automatiquement. Le champ « Profil de mouvement » de DotGrid décrit honnêtement qu'il est « hérité
des scènes historiques » mais ne dit pas qu'il est sans effet (A8).

**B6. Le fichier d'état n'a pas de version [lu].** `BackgroundFile` n'a aucun champ `version`.
`migrateBackgroundFile` migre sur **heuristiques de contenu** (effet retiré `MatrixGridBackground`,
`id` absent). Ajouter D3 (valeurs neutres) ou changer l'unité du branding (1080p, fait aujourd'hui à la
main sur votre état) exige un marqueur pour ne migrer qu'une fois : **le format doit être versionné**.
Les types `token` et `textarea` du schéma de champs ne sont utilisés par aucun effet (vestiges du moteur
archivé).

**B7. Modules bien faits à conserver [lu].** `background-transition.js` (pur, normalisation tolérante
+ validation stricte, bornage à 2 000 ms), `background-state-format.js` pour ses validations
(« refuse au lieu de corriger »), et la logique de fusion avec verrou optimiste par révision. Le défaut
B1 est dans la copie, pas dans la conception de l'import.

### Lot 4 — serveurs et OBS

Lus en entier : `dev/background-state-server.js`, `dev/obs-scene-client.js`, `obs-scene-mapping.js`,
`dev/static-server.js`, `dev/dev-server-shared.js`, `docs/security.md`.

**C1. Sécurité : voir §0 (U1, U2)** — écoute sur toutes les interfaces, racine du dépôt servie en
entier, CORS ouvert, pare-feu désactivé.

**C2. Le module ne peut pas être importé sans démarrer un serveur [lu].** `Bun.serve(...)`, la lecture de
l'environnement (`PORT`, `OBS_WS_*`, `STATE_FILE`) et le démarrage du client OBS s'exécutent **à
l'import**, au niveau du module, sans aucun export. Les 26 appels `fetch` de
`background-state-server.test.js` passent donc par un vrai serveur. Une fabrique
`createHostServer(deps)` (stockage et adaptateurs injectés) rendrait chaque handler testable sans réseau.

**C3. Ajouter un canal temps réel touche cinq endroits [lu].** Quatre ensembles de clients
(`stateClients`, `presetClients`, `eventClients`, `brandingClients`), quatre fonctions de diffusion,
la table `WS_CHANNELS`, `open()` et `close()`. Dans `open()`, un canal inconnu tombe silencieusement dans
`eventClients` (`else`). Un seul mécanisme de canaux nommés (abonnement/diffusion) remplacerait tout cela.

**C4. Conflation entre « édité » et « à l'antenne » [lu].** `applySceneMapping` **réécrit
`current` dans le fichier persistant** à chaque changement de scène OBS. Le même champ `current` sert à
ce que le tuner édite et à ce qui est diffusé. C'est exactement la distinction que le cadrage tranche
(brouillon / publié) : le modèle actuel ne peut pas la porter sans séparer ces deux états.

**C5. Le client OBS est bien fait et prêt à être réutilisé [lu].** `obs-scene-client.js` : dépendances
injectées (socket, temporisation, journal), reculs de reconnexion, mot de passe refusé = un seul message
sans boucle, `error` ignoré car `close` suit toujours. Pour écouter les `CustomEvent` de Twitchat, **il
faudra élargir l'abonnement** : il ne demande que la catégorie `Scenes` (`1 << 2`). D'après le protocole
v5 (hypothèse à vérifier à l'implémentation), `CustomEvent` relève de la catégorie `General` (`1 << 0`).

**C6. Le bouton « Actualiser » des scènes OBS ne peut pas voir de nouvelle scène [lu].** La liste des
scènes n'est demandée qu'**une fois**, à l'identification. `GET /obs-status` renvoie ce cache. Une scène
créée dans OBS après la connexion n'apparaît pas dans « Scènes OBS » avant une reconnexion. À confirmer
dans OBS (QA court).

**C7. Les handlers de presets sont corrects mais dupliquent le patron [lu].** Chacun fait
lire-valider-transformer-écrire-diffuser avec la même structure ; `handleSavePreset` recompose à la main
les champs optionnels (`tags`, `transition`, `showBranding`) par une triple conditionnelle : c'est
précisément le motif de liste blanche qui a produit B1, ici correctement tenu à jour. Une fonction
« fusionne les champs fournis sur l'existant » appliquée partout supprimerait cette classe d'erreur.

**C8. `docs/security.md` est périmé [lu].** Il décrit le relais archivé (jeton `?token=`, `POST /emit`
avec secret partagé, limiteur de débit, port 4456) et ne mentionne ni le serveur d'état, ni le serveur
statique, ni l'exposition mesurée en §0.

### Lot 5 — Studio (contrôleurs, vignettes, réactions, branding)

Lus en entier : `dev/background-preview-controller.js`, `dev/background-preset-controller.js`,
`dev/background-field-renderer.js`, `dev/background-preview-session.js`, `dev/preset-thumbnail.js`,
`components/ReactionOverlay.js`, `components/BrandingLayer.js`, début de `dev/background-live-readiness.js`.

**D1. Le tuner publie à l'antenne à chaque modification, y compris « Essayer » [lu].**
`createBackgroundPreviewController` appelle `schedulePersist()` (temporisation de 150 ms) après
chaque changement de champ ; `persistNow` envoie l'état au serveur, qui le diffuse aux pages OBS.
Cliquer un preset de la liste appelle `preview.apply(preset, id, **true**)` : le dernier argument est
`persist`. Même chose pour l'« ambiance » d'un point de départ : `apply(preset, null, true)`. Le guide
dit pourtant que **Essayer « charge une ambiance sans la sauvegarder »** : elle n'est pas enregistrée
comme preset, mais **elle part à l'antenne**. C'est une cause directe de la confusion de l'owner sur le
rôle du tuner, et la justification concrète du brouillon/publication (C4).

**D2. DÉFAUT CONFIRMÉ — les vignettes des « Points de départ » disparaissent [lu + mesuré].**
`renderPresets` commence par `disposeThumbnails()`, qui détruit **toutes** les vignettes suivies, y
compris celles des points de départ que `renderBuiltinPresets` vient de créer (même tableau
`thumbnails`). Or chaque frappe dans la recherche appelle les deux. Mesuré dans le vrai tuner à 1920×1080
(6 s d'attente après chaque étape) :

| Étape | Points de départ : vignettes dans le DOM / avec image | Mes presets |
|---|---|---|
| Après chargement | 5 sur 5 / 5 | 1 sur 1 / 1 |
| Après une frappe dans la recherche | **0 sur 5 / 0** | 0 ligne (filtre) |
| Après effacement de la recherche | **0 sur 5 / 0** | 1 sur 1 / 1 |

Les points de départ ne retrouvent leurs vignettes qu'après rechargement de la page. Cause : un tableau
de suivi partagé par deux listes dont une seule est détruite.

**D3. Les vignettes sont régénérées en entier à chaque rafraîchissement [lu].** Chaque `renderPresets`
détruit et recrée **toutes** les vignettes ; chacune remonte l'effet réel, attend 500 ms (jusqu'à 4 essais,
soit 2 s), photographie, démonte, **en série** (`thumbnail-queue`). Avec N presets, chaque renommage,
duplication, suppression ou import rejoue N captures. Non mesuré au-delà de 6 presets ; à vérifier si
la bibliothèque grossit. `preset-thumbnail.js:38` demande `willReadFrequently` sur un canvas dont
l'effet a déjà créé le contexte sans l'option : le navigateur l'ignore et avertit (observé en console).

**D4. La session d'aperçu repose sur un drapeau temporel [lu].** `createBackgroundPreviewSession` pose
`arriving = true`, appelle `snapshot()`, puis remet `arriving = false` : c'est ce drapeau, modifié
**autour** d'un appel, qui décide si l'état diffusé porte une `transition`. Un couplage temporel fragile.
Dans le modèle cible, « une arrivée » est un **événement** distinct de l'état, pas un champ éphémère.

**D5. Deux implémentations divergentes des quatre alertes [lu].** `ReactionOverlay` et `DotGridAnimated`
dessinent chacune follow, sub, raid et bits, avec des **durées différentes** (overlay : 1 800 / 1 600 /
2 600 / 1 400 ms ; DotGrid : 2 000 / 2 000 / 3 000 / 1 500 ms). Le routage « natif sinon overlay »
(`background-reactions.js`) cache cette divergence. Une couche « alerte » unique, avec ses variantes
déclarées, supprimerait le doublon.
`ReactionOverlay` est par ailleurs bien construit (ordonnanceur pur, boucle paresseuse qui ne tourne
que pendant une réaction, dépendances injectées) : à conserver comme base.

**D6. Z-order géré par rustines [lu].** `OVERLAY_CANVAS_STYLE` impose `z-index: 1` parce que « l'effet est
(ré)appendu après l'overlay » (bug trouvé en live le 2026-07-24) ; `background.html` pose
`branding.el.style.zIndex = '2'` ; DotGrid met `z-index: var(--z-bg, 0)`. L'ordre des couches est
réparti entre trois fichiers et le DOM. Une pile de couches explicite le rend déclaratif.

**D7. Le contrôle « relais » est mort et inactif [lu + mesuré].** `relayCheck` renvoie `status: 'ready'`
**dans les deux branches** : ce contrôle ne peut jamais échouer (une vérification qui n'a jamais été
rouge ne vérifie rien). Il interroge pourtant `http://localhost:4456/` à chaque ouverture du tuner :
la console enregistre `net::ERR_CONNECTION_REFUSED http://localhost:4456/`. À supprimer.

**D8. Code d'interface mort [lu].** Les types de champ `token` et `textarea` (`buildTokenField`,
branche `textarea`) ne sont utilisés par aucun schéma d'effet ; `design-tokens.js` n'y sert qu'à eux.

**D2 bis — la cause est plus générale [lu].** Le runtime abonne `presets.refresh` aux messages
`presets-ws` : **toute** mutation de preset (enregistrement, renommage, duplication, suppression,
import, y compris depuis un autre onglet) rappelle `renderPresets` et détruit donc les vignettes des
points de départ. La frappe dans la recherche n'est qu'un déclencheur parmi d'autres.

**D9. Le contrôleur d'aperçu cumule les rôles [lu].** `createBackgroundPreviewController` (233 lignes)
détient le montage, la session audio, l'overlay de réactions, la session d'aperçu, la publication à
l'antenne (temporisation), **sa propre boucle `requestAnimationFrame`** de mesure de FPS, le
rechargement de page pour changer la qualité (`location.replace`), la pause sur visibilité et le
remplissage du menu d'effets, avec deux « attache » tardives (`attachTransitionControls`,
`attachBrandingControls`) qui trahissent un câblage circulaire. C'est le module à scinder en premier
dans le Studio.

### Lot 6 — petits modules, outillage, tuner historique

Lus sans leurs commentaires : contrôleurs d'import, de branding, de scènes OBS, de préparation au live,
présentateurs, utilitaires (`keyed-lock`, `port-check`, `kill-servers`, `start-dev`), `tuner-server.js`,
`dotgrid-params-format.js`, `color-utils.js`, `obs-auth.js`, runtime du tuner, client d'état.

**E1. Le tuner DotGrid historique est déjà cassé [lu + exécuté].** `applyDotGridParamsToSource` cherche
par expression régulière la ligne `const dotRadius   = options.dotRadius   ?? …` (trois espaces, `const`).
Le fichier actuel contient `let dotRadius = options.dotRadius ?? 2.15;`. Rejeu de l'action
« Sauvegarder » sur le vrai fichier (en mémoire, sans écriture) : **échec, `Ligne dotRadius
introuvable`**. L'outil qui réécrit du code source ne fonctionne plus ; son retrait (D4, accepté) ne
supprime donc aucune capacité réelle.

**E2. Le motif « publier à chaque modification » se répète [lu].** Le branding est envoyé au serveur 250 ms
après chaque frappe ou glissement (`branding-controller.js`), comme l'état du fond (D1). Un aller-retour
est protégé par comparaison de chaînes JSON dans `preview.receive`. *Hypothèse, non testée :* un écho
serveur tardif d'une valeur plus ancienne pourrait ramener le formulaire en arrière pendant un
glissement de curseur, puisque `receive` reconstruit tout le formulaire (`fieldRenderer.render`).

**E3. Code mort supplémentaire [lu + `grep`].** `hueShiftRgb` et `buildHueShiftLUT` (`color-utils.js`,
environ 40 lignes) n'ont aucun usage hors définition et tests ; DotGrid utilise sa propre rampe
(`buildColorRamp`). Mêmes constats : `computeAmbientDelay`, `morphTo`, `lerpModeParams` (A9).

**E4. `resolveColor` passe par le DOM [lu].** Chaque résolution d'une couleur CSS crée un élément,
l'insère dans `document.body`, lit `getComputedStyle`, le retire. Appelé à la création et au changement de
couleur (pas par image), donc sans coût visible, mais un effet ne peut pas être instancié sans `document`.
Un service de couleurs avec cache serait plus propre.

**E5. Cycle de vie des processus bricolé en quatre fichiers [lu].** `start-dev.js`, `start-stream.js`,
`kill-servers.js`, `port-check.js` recomposent à la main : lancement de deux processus enfants, détection
de port occupé, recherche du PID par `netstat`, vérification par `tasklist` que c'est bien `bun.exe`,
`taskkill`. C'est la cause racine de vos « un script pour lancer et un autre pour tuer » : **deux
serveurs = deux processus enfants = des orphelins possibles**. Fusionner le serveur statique et le
serveur d'état en un seul processus (déjà prévu par la spec zéro-installation) supprime cette classe de
problèmes. `start-dev.js` ouvre les pages après un délai fixe de 2 s, sans attendre que les serveurs
répondent.

**E6. Le préparateur au live est démesuré par rapport à ce qu'il vérifie [lu].** 279 lignes de logique
plus 157 de contrôleur DOM pour environ cinq vérifications, dont une morte (D7) et une qui ne peut
qu'afficher « ✓ » (`runtimeCheck` signale « Mesure locale disponible » dès qu'un FPS existe, sans seuil).
À refondre avec le Studio, pas à étendre.

**E7. Meilleures pratiques à reprendre [lu].** Le trio réducteur pur / présentateur / contrôleur de
l'import de presets (`background-preset-import-flow.js`, `…-presenter.js`, `…-transfer-controller.js`)
est la partie la mieux structurée du Studio : état explicite, commandes retournées par le réducteur,
aucun accès DOM dans la logique. C'est le **modèle à suivre pour l'état d'édition** du Studio (D1).

## 9. Bilan des défauts réels trouvés à la lecture

Tous ont été **observés** (exécution ou mesure), sauf mention contraire. Aucun n'est corrigé à ce stade.

| # | Défaut | Preuve | Gravité | Correctif proposé |
|---|---|---|---|---|
| U1 | Mot de passe OBS lisible par tout le réseau local | `netstat` : écoute `0.0.0.0` ; `GET /.env` → 200 ; pare-feu Windows désactivé | **Élevée** | `127.0.0.1` + liste blanche de fichiers + changer le mot de passe |
| U2 | API d'état ouverte à toute origine web | `OPTIONS` → `Access-Control-Allow-Origin: *` | Élevée | Origines autorisées, contrôle d'`Origin` sur les WebSockets |
| U3 | Un import de presets retire `transition` et `showBranding` de **tous** les presets | Aller-retour exécuté sur le vrai code | Élevée (perte de données) | Copie structurelle + test sur l'ensemble des clés |
| D2 | Les vignettes des points de départ disparaissent après toute mutation de preset | Parcours du vrai tuner : 5/5 puis 0/5 | Moyenne | Un suivi de vignettes par liste |
| D1 | Le tuner publie à l'antenne à chaque modification, « Essayer » compris | Lu (`persist = true`, 150 ms) | Moyenne (confusion, risque en live) | Brouillon + publication (cadrage) |
| A2 | Position = temps absolu × facteur : saut de plusieurs dizaines à centaines de px avec le son | Calcul sur les formules lues (**non vu dans OBS**) | Moyenne | Horloge unique à temps intégré |
| A8 | Le sélecteur « Profil de mouvement » de DotGrid ne change rien | 8 modes, 1 valeur distincte | Faible (confusion) | Retirer le champ |
| E1 | Le tuner DotGrid historique ne sauvegarde plus | Rejeu : `Ligne dotRadius introuvable` | Faible | Retrait (D4 accepté) |
| D7 | Le contrôle « relais » interroge un service disparu et ne peut jamais échouer | Console : `ERR_CONNECTION_REFUSED :4456` | Faible | Supprimer |
| C6 | « Actualiser » n'affiche pas les scènes OBS créées après la connexion | Lu (liste demandée une fois) ; **à confirmer dans OBS** | Faible | Redemander la liste, ou écouter `SceneListChanged` |

Ordre de correction suggéré : **U1 et U2 d'abord** (sécurité, petit périmètre), puis **U3** (perte de
données, et filet de la migration), puis D2 et D7 avec le nettoyage prévu. A2, D1 et A8 sont résolus par
les étapes de migration plutôt que par des rustines.
