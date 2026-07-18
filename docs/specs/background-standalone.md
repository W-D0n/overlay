---
feature: background-standalone
created: 2026-07-14
status: validated
---

# Spec : background-standalone — URL OBS background-only + page de tuning

## Contexte et décisions owner (2026-07-14)

Changement de direction : le moteur de scènes (scènes, transitions, panneau, relay de scènes)
est **mis de côté** — il reste dans le repo mais n'évolue plus. Le focus devient :

1. Une **URL OBS dédiée** ne rendant QUE les animations de fond (12 effets enregistrés).
2. Une **page de tuning** avec barre latérale rétractable : dropdown des effets disponibles +
   formulaire de paramètres généré, avec aperçu plein écran intégré (même moteur de rendu).

Décisions validées (AskUserQuestion, 2026-07-14) :
- **Pilotage live + persistance** — chaque réglage est appliqué en temps réel dans OBS via un
  serveur d'état + WebSocket, ET persisté pour que l'URL OBS recharge le dernier état au démarrage.
- **Aperçu intégré** — la page de tuning rend l'animation en plein écran derrière la sidebar.
- **Intégrée au flux stream** — `background.html` à la racine ; le serveur d'état tourne aussi
  pendant le live (il n'écrit qu'un JSON d'état, jamais de code source).
- **Presets nommés** — sauvegarder/rappeler plusieurs configurations nommées.

## Architecture

### Fichiers

| Fichier | Rôle |
|---|---|
| `background.html` (racine) | URL OBS. `#bg-layer` plein écran 1920×1080, `pointer-events: none`. Charge l'état courant (GET), s'abonne au WS, applique les changements live. Serveur absent au démarrage → page vide ; coupure après chargement → dernier rendu valide conservé ; reconnexion avec backoff dans les deux cas. |
| `background-mount.js` (racine) | Module partagé : applique un état `{ component, options }` sur un conteneur. Même composant → `update(options)` ; composant différent ou `null` → `destroy()` + remontage. `setPaused(true)` démonte le rendu tout en mémorisant le dernier état. |
| `background-selection.js` (racine) | Résout soit l'état courant, soit un preset fixé par `?preset=...`, et construit les URL OBS dédiées. Logique pure testée. |
| `dev/background-state-format.js` | Logique pure : validation, migration des anciens presets, identifiants stables, création/mise à jour/renommage/duplication/suppression. Testée (`.test.js`). |
| `dev/background-preset-library.js` | Recherche commune, format d'échange versionné et fusion atomique des imports. Logique pure testée. |
| `dev/background-preset-import-flow.js` | État pur de confirmation : seule l'action confirmée produit une commande d'import. |
| `dev/background-preset-presenter.js` | Formate le plan métier pour l'interface, sans polluer la bibliothèque de domaine. |
| `dev/background-live-readiness.js` | Diagnostic pré-live en lecture seule : état, sélection, URL OBS, mesure locale et relais optionnel. La collecte réseau est séparée de l'évaluation pure. |
| `dev/background-state-client.js` | Interface unique du protocole HTTP/WS du tuner : lectures, commandes de preset, import et reconnexion des deux flux temps réel. |
| `dev/background-field-renderer.js` | Rend tous les types de `FieldSchema`, la palette et les contrôles numériques derrière `render(component, options)`. |
| `dev/background-preview-controller.js` / `background-preview-session.js` | Orchestrent l'effet courant, le preset actif, les options par défaut, le montage, la persistance débouncée, la qualité et la mesure FPS. La session en mémoire est testée sans DOM. |
| `dev/background-preset-controller.js` | Porte la bibliothèque personnelle et Atelier, la recherche et les actions CRUD des presets. |
| `dev/background-preset-transfer-controller.js` | Isole l'export et le parcours d'import prévisualisé puis confirmé ; son câblage est testé sans navigateur. |
| `dev/background-readiness-controller.js` | Rend et relance le diagnostic pré-live ; rejoue la révélation progressive des résultats en respectant la réduction de mouvement. |
| `dev/background-tuner-runtime.js` | Point d'entrée d'orchestration : câble les contrôleurs, charge l'état et la palette, puis démarre les abonnements. |
| `dev/background-state-server.js` | Serveur Bun (port 4462, `BACKGROUND_STATE_PORT`). Persiste `dev/data/background-state.json`. Écritures sérialisées (`keyed-lock`). |
| `dev/studio.html` / `dev/studio.config.js` | Entrée unique vers le tuner de fonds et l'éditeur des scènes complètes ; navigation déclarée hors de la page. |
| `dev/background-tuner.html` | Markup et styles de la page de tuning ; son script d'entrée délègue toute l'implémentation à `background-tuner-runtime.js`. |
| `dev/builtin-background-presets.js` | Sélection éditoriale immuable ; une copie n'entre dans l'état utilisateur qu'après action explicite. |
| `components/canvas-runtime.js` | Politique DPR commune : plafond 2 en auto, 1 avec `?quality=performance`. |
| `dev/numeric-field-control.js` | Contrôle slider + valeur exacte partagé par les deux éditeurs. |
| `docs/guides/tuner-le-fond.md` / `.html` | Guide : utiliser l'URL OBS + le tuner, et **ajouter une animation sans agent** (composant + registre + schéma). |

### État persisté — `dev/data/background-state.json`

```json
{
  "current": { "component": "RainBackground", "options": { "intensity": 0.6 } },
  "presets": [
    { "id": "pluie-douce", "name": "pluie douce", "component": "RainBackground", "options": { "intensity": 0.3 }, "tags": ["calme"] }
  ]
}
```

- `current.component` : `null` (aucun fond) ou un nom de `BACKGROUND_COMPONENT_NAMES`
  (`dev/component-field-schemas.js` — source unique du vocabulaire des effets).
- `preset.id` : identifiant URL immuable en minuscules/chiffres/tirets. Le nom reste éditable.
- Les fichiers historiques sans `id` sont migrés en mémoire par slug déterministe. Ils sont
  persistés au prochain changement, sans modifier `component` ni `options`.
- Fichier absent → état par défaut `{ current: { component: 'DotGridBackground', options: {} }, presets: [] }`.
- Fichier corrompu/invalide → **erreur explicite** (GET 500 avec la liste d'erreurs), jamais de
  reset silencieux (anti-pattern « masking failures »).

### Format d'échange des presets

L'export ne contient que la bibliothèque personnelle et porte un contrat versionné :

```json
{ "format": "overlay-background-presets", "version": 1, "presets": [] }
```

L'import valide le bundle complet avant toute écriture. Un `id` connu est mis à jour pour garder
son URL OBS ; un `id` nouveau est ajouté. Si son nom appartient déjà à un autre identifiant, le nom
importé reçoit le suffixe `— import` (puis un numéro si nécessaire).

### Routes du serveur d'état

| Route | Corps | Comportement |
|---|---|---|
| `GET /state` | — | Renvoie `{ current, presets }`. |
| `POST /state` | `{ current }` | Valide, persiste, diffuse `current` sur le WS. 400 si invalide. |
| `POST /save-preset` | `{ id?, name, component, options, tags? }` | Sans `id`, crée un identifiant unique ; avec `id`, met à jour le preset. |
| `POST /rename-preset` | `{ id, name }` | Renomme sans modifier l'identifiant ni l'URL. |
| `POST /duplicate-preset` | `{ id }` | Crée une copie autonome au nom et à l'identifiant uniques. |
| `POST /preview-import` | `{ bundle }` | Calcule `{ revision, created, updated, renamed, unchanged, changes }` sans écrire ; `changes` décrit l'opération et les valeurs utiles de chaque preset. |
| `POST /import-presets` | `{ bundle, expectedRevision }` | Fusionne atomiquement si la révision est inchangée ; sinon 409 sans écriture. |
| `POST /delete-preset` | `{ id }` | Supprime. 404 si absent. |
| `WS /state-ws` | — | Diffuse le JSON de `current` à chaque `POST /state` réussi. |
| `WS /presets-ws` | — | Diffuse `{ id, name, action }` après une mutation de preset. |

Toutes les écritures passent par un `keyed-lock` (clé unique) — même motif que
`scene-data-server.js`, ce process est le seul écrivain du fichier.

### Intégration lancement

- `dev/start-dev.js` : ajoute le serveur `background-state` (port 4462) + ouvre
  `dev/studio.html` et la preview complète.
- `dev/start-stream.js` : ajoute le serveur `background-state` — nécessaire pour que
  `background.html` (Browser Source) charge son état et reçoive les changements live. Ce serveur
  ne modifie jamais de code source : safe en live, contrairement à `tuner-server.js`.

### Page de tuning — UX

- Sidebar superposée à gauche, bouton de rétraction sur son bord.
- Dropdown des effets (dont « (aucun) ») ; changement → montage avec les valeurs par défaut du
  schéma.
- Formulaire généré depuis `BACKGROUND_FIELD_SCHEMAS` (types `text`, `number`, `select`,
  `textarea`, `color` et `colors` ; `token` reste disponible pour l'éditeur de scènes historique).
- Les nombres utilisent les métadonnées `min`, `max`, `step`, `unit`, `control` du `FieldSchema` :
  slider pour le geste et champ numérique pour la précision.
- Chaque changement : rendu local immédiat + POST `/state` (débounce 150 ms).
- Presets : création/mise à jour avec tags éditables, renommage sans casser l'URL, duplication,
  suppression et copie de l'URL. La recherche couvre nom, effet et tags. Export/import rend la
  bibliothèque personnelle portable ; le plan d'import résume créations, mises à jour, noms
  ajustés et presets ignorés, puis détaille les valeurs utiles par preset dans une liste scrollable
  avant confirmation. Six presets Atelier fournissent des points de départ sans polluer l'état
  utilisateur.
- Profil performance : indicateur FPS, DPR 1 ; le mode auto plafonne le DPR à 2.
- Le bloc « Prêt pour le live » vérifie en lecture seule l'état, la sélection, l'URL OBS, la mesure
  locale et le relais optionnel. Il distingue prêt, attention et bloquant, avec une action guidée
  par ligne. « Revérifier » rejoue les résultats dans leur ordre ; `prefers-reduced-motion` retire
  ce mouvement. Aucun seuil FPS arbitraire n'est présenté comme une certification OBS.
- `background.html` et le tuner appellent `setPaused(document.hidden)` à chaque changement de
  visibilité afin qu'un canvas invisible ne continue pas sa boucle.
- La page écoute aussi le WS (synchro si un autre onglet modifie l'état).

### URL liée à un preset

`background.html?preset=discussion-calme&transparent=1` ignore l'état courant et monte uniquement le
preset portant cet identifiant. La page écoute `/presets-ws` et le recharge lorsqu'il est modifié.
Le lookup par ancien nom reste accepté pour les URL créées avant la migration.
Un nom absent produit une erreur explicite en console et ne retombe pas silencieusement sur le fond
courant. Dans OBS, une source Navigateur dédiée par preset permet d'affecter des fonds différents
aux scènes sans réactiver le moteur de scènes historique.

## Extension — ajouter un nouvel effet

Trois pièces déclaratives, aucune UI à écrire :

1. **Composant** `components/XxxBackground.js` — pattern `{ el, update(options), destroy() }`.
2. **Registre** — une ligne dans `component-registry.js` + `component-names.js`.
3. **Schéma** — une entrée dans `BACKGROUND_FIELD_SCHEMAS` (`dev/component-field-schemas.js`).

L'effet apparaît alors dans le dropdown du tuner et est accepté par la validation serveur, sans
toucher à `background.html`, au tuner ni au serveur. Détail pas-à-pas (y compris sans agent) dans
`docs/guides/tuner-le-fond.html`.

## Tests

`dev/background-state-format.test.js` couvre validation, migration, collisions d'identifiants,
création/mise à jour, renommage, duplication, suppression et non-mutation. `background-mount.test.js`
couvre pause/reprise ; `components/canvas-runtime.test.js` couvre les deux profils DPR ;
`dev/builtin-background-presets.test.js` valide la bibliothèque Atelier ;
`dev/background-preset-library.test.js` couvre recherche, échange versionné, rejet atomique,
création, mise à jour, renommage, conflit, absence de changement et fusion sans écrasement.
`dev/background-state-server.test.js` vérifie par HTTP qu'un import invalide
n'écrit pas le fichier, qu'une révision périmée est refusée et qu'aucun événement WebSocket indu
n'est diffusé. `dev/background-preset-import-flow.test.js` garantit qu'aucune commande réseau
n'existe avant confirmation ; le présentateur possède son test de libellé séparé.
`dev/background-live-readiness.test.js` couvre les états prêt, attention et bloquant, les URL
courante et liée à un preset, les données partielles et la collecte réseau exclusivement en GET.
`dev/background-state-client.test.js`, `background-field-renderer.test.js`,
`background-preview-session.test.js`, `background-preset-transfer-controller.test.js`,
`background-tuner-runtime.test.js` et `background-readiness-controller.test.js` couvrent les
interfaces extraites, les messages de démarrage et les parcours à risque avant leur câblage dans
la page.

## Hors scope

- Rendus et configurations des neuf scènes : conservés. Leur accès dans le Studio et les contrôles
  de formulaire partagés peuvent évoluer tant qu'ils ne modifient pas leur apparence.
- Superposition de plusieurs effets dans une même Browser Source.
- Association automatique pilotée par OBS WebSocket ; les URL liées aux presets couvrent le besoin
  scène par scène sans ajouter cette dépendance.

## Extensions livrées après validation (2026-07-16)

- `color` / `colors` dans `FieldSchema` : picker visuel, couleurs nommées, saisie CSS libre,
  listes dynamiques et gradients issus de `components/color-palette.json`.
- `dev/color-palette-format.js` : normalisation pure et testée des couleurs/gradients.
- `WaterRippleBackground` : douzième effet, livré via factory + registre + schéma.
- Horloge canvas partagée `components/animation-time.js` : vitesse indépendante du framerate pour
  Rain, Bubble, Fireflies, FloatingSymbols et ColorDrops.
- Studio V1, contrôles numériques guidés, presets à identifiant stable, bibliothèque Atelier et
  profil performance livrés le 2026-07-17.
- Recherche nom/effet/tag et export/import versionné de la bibliothèque personnelle livrés le
  2026-07-17.
