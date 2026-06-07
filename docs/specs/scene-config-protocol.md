---
feature: Format config de scène + protocole {type,data} étendu
created: 2026-06-07
updated: 2026-06-07
status: reviewed
---

# Spec : Format config de scène + protocole `{type,data}` étendu

## Contexte

L'overlay migre vers une architecture **page-unique** (S3). Pour que le runtime puisse monter
des scènes dynamiquement sans connaître leur contenu à l'avance, chaque scène doit décrire
ses couches et ses composants dans un **objet sérialisable**.

Ce format est aussi le format qu'un futur éditeur de scènes écrira — on adopte la structure
maintenant sans construire l'éditeur (voir `docs/inbox.md`).

**Intention d'évolution :** si un éditeur de scènes web est développé un jour, il sera un projet
**séparé avec son propre build step** (donc en TypeScript). Le format `SceneConfig` défini ici reste
importable tel quel : l'éditeur produit et consomme exactement la même structure sérialisable.
L'overlay lui-même reste en JS natif `// @ts-check` (contrainte zero-build, voir CLAUDE.md).

Le protocole `{type,data}` est étendu pour piloter la scène active, le niveau de visibilité,
et le morphisme DotGrid depuis n'importe quelle source externe (MyVault, script Python, OBS WS v5).

Référence : `docs/overview.md` §Couches nommées, §Deux axes orthogonaux.

## Décisions d'architecture

Trois décisions structurantes, validées avec l'owner, cadrent cette spec.

### AD-1 — Logique pure séparée des effets de bord

`store.js` couplait aujourd'hui la **logique** (valider un message, calculer le nouvel état,
décider quels événements émettre) et les **effets** (`setState`, `document.dispatchEvent`,
`WebSocket`, `setInterval`). On extrait la logique dans un module **pur** `protocol.js` :

- `protocol.js` ne touche **ni** le DOM, **ni** le réseau, **ni** le temps. Fonctions pures.
- `store.js` devient une **coquille d'effets** : il appelle la logique pure puis exécute la
  décision (applique le patch, dispatche les événements, loggue les warnings).

Bénéfice : la logique du protocole devient **testable de façon autonome** (sans navigateur),
ce qui rend les tests indépendants — exigence d'un projet public. Applique les règles CLAUDE
*« Logic layer has zero runtime dependency »* et *« Pure functions by default; isolate side effects »*.

### AD-2 — Le placement vit dans le CSS, pas dans le format

Une scène se compose de **deux** artefacts complémentaires :

| Artefact | Porte | Défini dans |
|---|---|---|
| **Logique** | couches nommées, visibilité par niveau, composants montés, mode DotGrid | `scenes/[id].config.js` (`SceneConfig`) |
| **Structure + placement** | balisage DOM, positions, dimensions, styles | template HTML de scène + CSS (via `tokens.css`) |

Le format `SceneConfig` **ne porte volontairement pas** la position ni le contenu DOM : ils
relèvent du CSS, cohérent avec la règle projet *« `tokens.css` = source de vérité, jamais de
valeur hardcodée »*. Un futur éditeur de scènes (S5) manipulera le CSS/template, pas un JSON
de coordonnées. Ce n'est pas une lacune cachée — c'est une frontière explicite : **données de
logique d'un côté, mise en page de l'autre**.

### AD-3 — Comportement par défaut : toujours un état de repos sûr

Pour éliminer la classe de bugs « état d'animation incohérent », il existe toujours un point
neutre vers lequel retomber :

- **Transition par défaut** `DEFAULT_TRANSITION` : toute résolution de transition incomplète,
  invalide ou absente retombe dessus. Jamais `undefined`, jamais de plantage.
- **Mode DotGrid de repos** : la fin (ou l'échec) de toute animation spéciale ramène le DotGrid
  à son mode ambiant ; si ce mode est lui-même invalide, `DEFAULT_DOTGRID_MODE`.

Règle mentale : **en cas de doute, retour au repos.** Voir §Comportement par défaut.

## Périmètre

**Inclus :**
- Types JSDoc (17) : `SceneId`, `VisibilityLevel`, `DotGridMode`, `TransitionType`, `TransitionEasing`,
  `ComponentName`, `ComponentMount`, `LayerVisibility`, `LayerConfig`, `SceneTransition`,
  `SceneConfig`, `MorphTriggerData`, `ProtocolEvent`, `EffectToken`, `ReduceContext`,
  `ReduceResult`, `ValidationResult`
- Extension `StreamState` : champs `currentScene` et `visibilityLevel`
- **`protocol.js` (logique pure, AD-1)** : `reduceMessage(state, message, context) → ReduceResult`
  gérant **les 11 types** (3 nouveaux + 8 existants migrés) + `validateSceneConfig(config) →
  ValidationResult` + constantes `DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE`. Aucun accès DOM/réseau/temps.
- **Refactor `store.js` en coquille d'effets** : `handleMessage` injecte `{ now }`, délègue à
  `reduceMessage`, puis applique patch / effects / events / warnings. Plus aucun `switch`. Init `STATIC_FALLBACK`.
- 3 configs de référence : `discussion`, `brb`, `codage`
- **Tests autonomes `bun test`** : `protocol.test.js` (réduction des 11 types + guard malformé +
  pureté) + validation des configs via `validateSceneConfig` (V0→V9).

**Exclu :**
- Runtime page-unique qui lit les configs → S3
- 5 configs restantes (`interview`, `react`, `creation`, `fin`, `jeu`) → S3
  (le format est stabilisé par les 3 références ; les autres configs suivent le même patron)
- Couches 3 et 4 de DotGridAnimated → sessions ultérieures
- Validation stricte côté store des champs `sdf` de `MorphTriggerData`
  (la forme exacte du descripteur SDF sera spécifiée avec la couche 3)
- **Génération de forme par IA (prompt → API)** : explicitement hors scope, et non prévu
  initialement. Le morphisme DotGrid s'appuie uniquement sur des sources **locales** (SDF
  mathématique calculé en local, bitmap PNG/SVG chargé localement). Aucun appel à une API
  externe payante (Anthropic ou autre). Le champ `prompt` mentionné dans le HANDOFF d'origine
  est retiré du protocole.
- Implémentation des transitions (moteur d'animation crossfade/cut) → S3.
  S2 ne définit que le **format** qui décrit quelle transition utiliser, et la constante
  `DEFAULT_TRANSITION` vers laquelle retomber.
- **Runtime page-unique** qui lit les configs, monte les couches, applique les transitions et
  masque `#bg-layer` au niveau `hidden` → S3. S2 produit le format + la logique du protocole,
  pas le moteur qui les consomme.
- **Templates HTML + CSS de scène** (structure/placement, AD-2) → produits au fil de S3 quand
  chaque scène est migrée en page-unique. S2 définit la frontière (logique vs placement), pas
  les templates eux-mêmes.

> Note : tout ce qui est listé ici est **séquencé**, pas écarté. Chaque élément a une session
> cible et une raison. Aucune friction connue n'est passée sous silence (voir §Frictions ouvertes).

## Acceptance Criteria

> « Vérifiable par » : **`bun test`** = garantie algorithmique automatisée (`protocol.test.js`).
> « review » = vérification statique d'un fichier (type/structure). Aucun AC ne dépend d'une
> vérification manuelle en live.

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `reduceMessage(state, { type:'scene.set', data:{ scene:'codage' } })` → `patch: { currentScene:'codage' }` + event `overlay:scene-change` detail `{ scene:'codage' }` | bun test |
| AC-02 | L'event `overlay:scene-change` produit par `reduceMessage` a `name === 'overlay:scene-change'` et un `detail.scene` valide | bun test |
| AC-03 | `reduceMessage(state, { type:'visibility.set', data:{ level:'minimal' } })` → `patch: { visibilityLevel:'minimal' }` + event `overlay:visibility-change` | bun test |
| AC-04 | L'event `overlay:visibility-change` a `detail: { level:'minimal' }` | bun test |
| AC-05 | `reduceMessage(state, { type:'morph.trigger', data:{ imageUrl:'logo.png' } })` → `events: [{ name:'overlay:morph', detail:{ imageUrl:'logo.png' } }]` | bun test |
| AC-06 | `morph.trigger` → `patch === null` (n'altère jamais `currentScene`/`visibilityLevel`) | bun test |
| AC-07 | `scene.set` avec `scene` inconnu → `patch: null`, `events: []`, `warnings: ['[overlay] scene.set : scène inconnue — <valeur>']` | bun test |
| AC-08 | `visibility.set` avec `level` inconnu → `patch: null`, `events: []`, `warnings: ['[overlay] visibility.set : niveau inconnu — <valeur>']` | bun test |
| AC-09 | `STATIC_FALLBACK` initialise `currentScene: 'brb'` | review fichier |
| AC-10 | `STATIC_FALLBACK` initialise `visibilityLevel: 'full'` | review fichier |
| AC-11 | `types.js` définit tous les types listés au §Types JSDoc (17 typedefs) | review fichier |
| AC-12 | `scenes/discussion.config.js` exporte `sceneConfig` conforme à `SceneConfig` | review + bun test (AC-28) |
| AC-13 | `scenes/brb.config.js` exporte `sceneConfig` conforme à `SceneConfig` | review + bun test (AC-28) |
| AC-14 | `scenes/codage.config.js` exporte `sceneConfig` conforme à `SceneConfig` | review + bun test (AC-28) |
| AC-15 | Chaque config de référence déclare exactement une couche `goldbar` avec `visibility.minimal === true` | bun test (V4, V5) |
| AC-16 | Chaque config de référence déclare au moins une couche avec `visibility.full === true` | bun test (V9) |
| AC-17 | La scène `jeu` (pas de DotGrid) est représentable par `dotgridMode: null` dans `SceneConfig` | review type |
| AC-18 | Chaque config de référence déclare `transition.type` ∈ `TransitionType` | bun test (V3) |
| AC-19 | `scene.set` avec override `transition` valide → l'event contient la clé `transition` ; sans override → clé **absente** (`'transition' in detail === false`, pas `undefined`) | bun test |
| AC-20 | `scene.set` avec `transition.type` inconnu → override ignoré (event sans `transition`), `warnings` contient `type de transition inconnu`, mais `patch: { currentScene }` présent (scène changée) | bun test |
| AC-21 | `MorphTriggerData` ne contient aucun champ `prompt` (sources locales uniquement) | review type |
| AC-22 | `scene.set` avec `scene === state.currentScene` → `patch: null`, `events: []` (no-op). Idem `visibility.set` avec `level === state.visibilityLevel` | bun test |
| AC-23 | `morph.trigger` avec `data` non-objet → `events: [{ name:'overlay:morph', detail:{} }]` + `warnings` contient `data invalide` | bun test |
| AC-24 | `StreamState` (typedef) inclut `currentScene: SceneId` et `visibilityLevel: VisibilityLevel` | review fichier |
| AC-25 | Tout message malformé (`scene.set`/`visibility.set` sans `data` ou hors domaine) → `patch: null`, `events: []`, exactement un `warning` | bun test |
| AC-26 | `reduceMessage(state, msg)` ne mute jamais `state` (deep-equal avant/après, pour tous les types de message) | bun test |
| AC-27 | `reduceMessage` sur un `type` inconnu → `{ patch: null, events: [], warnings: [] }` | bun test |
| AC-28 | `validateSceneConfig(c).ok === true` pour les 3 configs de référence | bun test |
| AC-29 | Pour chaque invariant V1→V9, une config violant *uniquement* cet invariant → `ok === false` avec le message attendu dans `errors` | bun test |
| AC-30 | `store.js` `handleMessage` applique l'ordre : `warnings` loggués, puis `setState(patch)` si non-null, puis `effects` exécutés, puis `dispatchEvent` de chaque event (séquencement setState avant dispatch) | review fichier |
| AC-31 | `protocol.js` exporte `DEFAULT_TRANSITION = { type:'crossfade', duration:400, easing:'easeInOut' }` et `DEFAULT_DOTGRID_MODE = 'brb'` | bun test |
| AC-32 | `reduceMessage(state, message, ctx)` avec `message` non-objet (`null`, `42`, `'x'`) ou sans `type` string → `{ patch:null, events:[], warnings:[], effects:[] }` (ne lève pas) | bun test |
| AC-33 | Les 8 types migrés (`stream.stats`, `chat.message`, `alert.*`, `poll.update`, `poll.end`, `pomodoro.tick`, `context.update`, `session.start`) produisent le `patch` du tableau §Types existants migrés, identique au comportement legacy | bun test |
| AC-34 | `alert.follow` → `patch.latestAlert.timestamp === context.now` (horloge injectée, déterministe) | bun test |
| AC-35 | `session.start` → `effects` contient `'reset-duration-timer'` et `patch.sessionId` est défini | bun test |
| AC-36 | `chat.message` → `patch.chatMessages` a au plus 20 entrées, le nouveau message en tête, `state` non muté | bun test |
| AC-37 | `validateSceneConfig(null)`, config sans `layers`, ou `layers` non-tableau → `{ ok:false, errors:[…] }` sans lever (V0a/V0b/V0c) | bun test |
| AC-38 | `ReduceResult` de tout message inclut toujours les 4 champs `patch`, `events`, `warnings`, `effects` (jamais `undefined`) | bun test |

## Types JSDoc

À ajouter dans `types.js` (après les typedefs existants) :

```js
/**
 * Identifiants de scène valides.
 * @typedef {'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin'|'jeu'} SceneId
 */

/**
 * Niveaux de visibilité de l'overlay (axe orthogonal à la scène).
 * - full    : toutes les couches visibles
 * - minimal : goldbar uniquement (+ DotGrid fond permanent)
 * - hidden  : aucune couche visible, body transparent (cinématique)
 * @typedef {'full'|'minimal'|'hidden'} VisibilityLevel
 */

/**
 * Modes ambiants de DotGridAnimated.
 * null = scène sans DotGrid (ex : jeu).
 * @typedef {'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin'|null} DotGridMode
 */

/**
 * Type de transition entre deux scènes.
 * - crossfade : fondu croisé en opacité (comportement par défaut)
 * - cut       : changement instantané (duration et easing ignorés)
 * Le moteur d'animation est implémenté en S3 ; S2 ne fait que déclarer le type voulu.
 * @typedef {'crossfade'|'cut'} TransitionType
 */

/**
 * Easing des transitions entre scènes (ignoré si type === 'cut').
 * @typedef {'easeInOut'|'easeIn'|'easeOut'|'linear'} TransitionEasing
 */

/**
 * Noms des composants JS montables dans une couche.
 * Résolu via registry dans le runtime S3.
 * @typedef {'GoldBar'|'StatBlock'|'ChatFeed'|'PomodoroBar'|'AlertBanner'} ComponentName
 */

/**
 * Une instance de composant à monter dans une couche.
 * @typedef {Object} ComponentMount
 * @property {ComponentName} component - Nom résolu par le registry
 * @property {Record<string, unknown>} options - Options statiques passées au constructeur
 */

/**
 * Règles de visibilité d'une couche selon le niveau d'overlay.
 *
 * Invariant (les niveaux sont imbriqués, du plus restrictif au plus permissif) :
 *   hidden ⟹ minimal ⟹ full
 * Autrement dit : une couche visible à un niveau restrictif doit l'être à tous les
 * niveaux plus permissifs. Combinaisons légales (4 seulement) :
 *   { full:false, minimal:false, hidden:false }  → jamais visible
 *   { full:true,  minimal:false, hidden:false }  → visible en full uniquement
 *   { full:true,  minimal:true,  hidden:false }  → visible en full + minimal
 *   { full:true,  minimal:true,  hidden:true  }  → toujours visible
 * Toute autre combinaison (ex : minimal:true sans full:true) est ILLÉGALE.
 *
 * @property {boolean} full    - Visible en mode plein
 * @property {boolean} minimal - Visible en mode minimal (⟹ full doit être true)
 * @property {boolean} hidden  - Visible en mode caché (⟹ minimal doit être true ; presque toujours false)
 */

/**
 * Configuration d'une couche nommée dans une scène.
 * La valeur de `name` sera utilisée comme valeur de l'attribut `data-layer` en S3.
 * @typedef {Object} LayerConfig
 * @property {string} name - Identifiant unique dans la scène (ex : 'chat', 'goldbar')
 * @property {ComponentMount[]} components - Composants à monter (tableau vide = DOM pur)
 * @property {LayerVisibility} visibility
 */

/**
 * Paramètres de transition lors d'un changement de scène.
 * Déclarés par la scène ENTRANTE (voir §Sélection de la transition).
 * @typedef {Object} SceneTransition
 * @property {TransitionType} type
 * @property {number} duration - Durée en ms (ignoré si type === 'cut')
 * @property {TransitionEasing} easing - (ignoré si type === 'cut')
 */

/**
 * Configuration complète et sérialisable d'une scène.
 * Format que le runtime S3 lit, et que l'éditeur de scènes écrira.
 * @typedef {Object} SceneConfig
 * @property {SceneId} id
 * @property {DotGridMode} dotgridMode - null si la scène n'utilise pas DotGrid
 * @property {SceneTransition} transition
 * @property {LayerConfig[]} layers
 */

/**
 * Données du message `morph.trigger`.
 * Sources LOCALES uniquement — aucun appel à une API externe.
 * La forme de `sdf` sera précisée dans la spec DotGrid couche 3B.
 * @typedef {Object} MorphTriggerData
 * @property {object}  [sdf]      - Descripteur SDF mathématique, calculé localement (couche 3B — forme à préciser)
 * @property {string}  [imageUrl] - URL bitmap PNG/SVG chargé localement (couche 3A)
 * @property {number}  [duration] - Durée morph-in en ms (défaut : 2000)
 * @property {number}  [hold]     - Durée maintien en ms (défaut : 3000)
 */

/**
 * Un événement DOM à émettre, décrit de façon pure (sans le dispatcher).
 * @typedef {Object} ProtocolEvent
 * @property {string} name   - Nom du CustomEvent (ex : 'overlay:scene-change')
 * @property {object} detail - Charge utile du CustomEvent
 */

/**
 * Jeton d'effet de bord que `reduceMessage` ne peut pas exécuter lui-même (pureté).
 * `store.js` traduit chaque jeton en effet concret.
 * - reset-duration-timer : remet le compteur de durée local à zéro (sur `session.start`)
 * @typedef {'reset-duration-timer'} EffectToken
 */

/**
 * Valeurs non-déterministes injectées dans `reduceMessage` pour le garder pur et testable.
 * @typedef {Object} ReduceContext
 * @property {number} now - Timestamp courant (ms), fourni par l'appelant (ex : `Date.now()`).
 *                          En test, valeur fixe → résultat déterministe.
 */

/**
 * Résultat pur de `reduceMessage` : décrit QUOI faire, sans le faire.
 * `store.js` exécute ensuite ces instructions (effets de bord).
 * @typedef {Object} ReduceResult
 * @property {Partial<StreamState>|null} patch - Changements d'état à appliquer (null = aucun)
 * @property {ProtocolEvent[]} events          - CustomEvents à dispatcher (tableau vide = aucun)
 * @property {string[]} warnings               - Messages à logguer via console.warn (tableau vide = aucun)
 * @property {EffectToken[]} effects           - Effets nommés à exécuter par store.js (tableau vide = aucun)
 */

/**
 * Résultat de `validateSceneConfig`.
 * `errors` est vide si et seulement si `ok === true`.
 * @typedef {Object} ValidationResult
 * @property {boolean} ok        - true si la config respecte tous les invariants
 * @property {string[]} errors   - Liste exhaustive des violations (vide si ok)
 */
```

## Format des configs de scène

### Règles générales

- Fichier : `scenes/[id].config.js`
- Export nommé : `export const sceneConfig = { … }`
- Le fichier est un module ES (`type="module"`) — pas de `export default`
- L'objet est JSON-sérialisable à l'exception des valeurs `ComponentName` (strings) :
  aucune fonction, aucune référence de classe

### Couche `goldbar` — règle obligatoire

Chaque scène doit déclarer exactement une couche `goldbar` avec :
- `visibility.minimal === true` (survit au niveau minimal)
- `visibility.hidden === false`
- Deux `ComponentMount` : un `GoldBar` `position: 'top'` et un `position: 'bottom'`

Exception : si la direction artistique d'une scène future impose une barre or absente
→ noter comme lacune dans la spec de cette scène.

### Couche `alert` — règle de placement

Les couches `AlertBanner` sont toujours en position absolue par-dessus les autres couches.
Dans le config : déclarer avec `visibility.full === true`, `visibility.minimal === false`.

### Configs de référence

#### `scenes/discussion.config.js`

```js
// @ts-check
/** @type {import('../types.js').SceneConfig} */
export const sceneConfig = {
  id: 'discussion',
  dotgridMode: 'discussion',
  transition: { type: 'crossfade', duration: 400, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top' } },
        { component: 'GoldBar', options: { position: 'bottom' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      name: 'cam',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'subject',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'VIEWERS', value: '—' } },
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 7, fontSize: '22px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'last-follow',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'alert',
      components: [
        { component: 'AlertBanner', options: { displayDuration: 5000 } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
```

#### `scenes/brb.config.js`

```js
// @ts-check
/** @type {import('../types.js').SceneConfig} */
export const sceneConfig = {
  id: 'brb',
  dotgridMode: 'brb',
  transition: { type: 'crossfade', duration: 600, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top', opacity: 0.6 } },
        { component: 'GoldBar', options: { position: 'bottom' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Bloc gauche : message de pause + activité + musique
      name: 'message',
      components: [],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Bloc droit : chat live
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 10, fontSize: '20px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Stats viewers + durée (dans la zone chat, séparés pour contrôle fin)
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'VIEWERS', value: '—' } },
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Bande basse : prochain stream
      name: 'next-stream',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
```

> Note BRB : `message` survit au niveau `minimal` — la raison d'être de la scène BRB
> est d'indiquer la pause. Goldbar seul ne suffit pas ici.

#### `scenes/codage.config.js`

```js
// @ts-check
/** @type {import('../types.js').SceneConfig} */
export const sceneConfig = {
  id: 'codage',
  dotgridMode: 'codage',
  transition: { type: 'crossfade', duration: 300, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top' } },
        { component: 'GoldBar', options: { position: 'bottom' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Zone de capture IDE (placeholder visuel — OBS superpose la vraie source)
      name: 'ide-zone',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Cam mini (placeholder)
      name: 'cam-mini',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Contexte IDE : fichier actif, branche git, stack
      name: 'ide-context',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Timer pomodoro
      name: 'pomodoro',
      components: [
        { component: 'PomodoroBar', options: {} },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Viewers + durée
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'VIEWERS', value: '—' } },
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Alerte plein écran + bande basse texte
      name: 'alert',
      components: [
        { component: 'AlertBanner', options: {} },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
```

## Logique pure — `protocol.js` (AD-1)

`protocol.js` contient toute la décision du protocole, sans aucun effet de bord. Importable
à la fois par le navigateur (via `store.js`) et par `bun test`.

### Constantes

```js
/** Transition de repli — utilisée quand la résolution échoue ou est incomplète (AD-3). */
export const DEFAULT_TRANSITION = { type: 'crossfade', duration: 400, easing: 'easeInOut' };

/** Mode DotGrid de dernier recours si le mode ambiant d'une scène est invalide (AD-3). */
export const DEFAULT_DOTGRID_MODE = 'brb';
```

### `reduceMessage(state, message, context) → ReduceResult`

Fonction **pure** : pour un état courant, un message entrant et un contexte (valeurs non-déterministes
injectées), retourne quoi faire (`{ patch, events, warnings, effects }`) sans rien exécuter. Ne mute
jamais `state`. Ne lève **jamais** — tout input non valide produit un `ReduceResult` explicite.

```js
/**
 * @param {import('./types.js').StreamState} state - État courant (lu, jamais muté)
 * @param {unknown} message - Message brut (potentiellement malformé : non-objet, sans `type`…)
 * @param {import('./types.js').ReduceContext} context - { now } (horloge injectée)
 * @returns {import('./types.js').ReduceResult}
 */
export function reduceMessage(state, message, context) { /* ... */ }
```

**Garde d'entrée (gap boundary)** : si `message` n'est pas un objet non-null, ou n'a pas de
`type` de type string → `{ patch: null, events: [], warnings: [], effects: [] }`. Aucune exception.

> `reduceMessage` gère **tous** les types du protocole — les 3 nouveaux (ci-dessous) **et** les 8
> types existants migrés (voir §Types existants migrés). C'est la décision AD-1 menée à terme :
> toute la logique du protocole est pure et testée ; `store.js` ne contient plus aucun `switch`.

#### Nouveaux types

**`scene.set`** — `data: { scene: SceneId, transition?: Partial<SceneTransition> }`
1. `scene` absent / non-string / hors `SceneId` → `{ patch: null, events: [], warnings: ['[overlay] scene.set : scène inconnue — <valeur>'], effects: [] }`
2. **Idempotence** : `scene === state.currentScene` → no-op (`patch: null`, `events: []`)
3. Override `transition` : présent mais non-objet → ignoré + warning `transition invalide`.
   Présent objet avec `type` hors `TransitionType` → ignoré + warning `type de transition inconnu`.
   Présent objet valide (champ `type` absent ou ∈ `TransitionType`) → conservé tel quel.
   Note : seul `type` est validé ici ; `duration`/`easing` éventuellement invalides sont relayés
   et seront sanitisés à la résolution runtime (§Sélection de la transition, étape 3, `DEFAULT_TRANSITION`).
4. Cas nominal → `patch: { currentScene: scene }`, `events: [{ name: 'overlay:scene-change', detail }]`
   où `detail = { scene }` + clé `transition` **uniquement** si un override valide subsiste.

**`visibility.set`** — `data: { level: VisibilityLevel }`
1. `level` absent / hors liste → `warnings: ['[overlay] visibility.set : niveau inconnu — <valeur>']`, pas de patch/event
2. Idempotence : `level === state.visibilityLevel` → no-op
3. Nominal → `patch: { visibilityLevel: level }`, `events: [{ name: 'overlay:visibility-change', detail: { level } }]`

**`morph.trigger`** — `data: MorphTriggerData`
1. `data` non-objet → `events: [{ name: 'overlay:morph', detail: {} }]` + warning `data invalide`
2. `data` absent → `events: [{ name: 'overlay:morph', detail: {} }]` (pas de warning)
3. Nominal → `events: [{ name: 'overlay:morph', detail: data }]`. Jamais de patch (état inchangé).
   **Pas d'idempotence** : rejouer un morphisme est valide ; la déduplication appartient au DotGrid.

**Type inconnu** (string non reconnue) → `{ patch: null, events: [], warnings: [], effects: [] }`.

#### Types existants migrés

Migration **fidèle** (comportement identique au `store.js` actuel) — on ne durcit pas leur
validation dans cette session, on déplace seulement la logique vers le réducteur pur. Tous
produisent un `patch` (jamais d'event), sauf `session.start` qui émet aussi un effet.

| `type` | `patch` produit (résumé) |
|---|---|
| `stream.stats` | `{ viewers: data.viewers ?? state.viewers, duration: data.duration ?? state.duration }` |
| `chat.message` | `{ chatMessages: [data, ...state.chatMessages].slice(0, 20) }` |
| `alert.follow` / `alert.sub` / `alert.raid` / `alert.bits` | `{ latestAlert: { type: <suffixe après '.'>, username: data.username ?? 'Anonyme', timestamp: context.now, amount: data.amount } }` |
| `poll.update` | `{ activePoll: data }` |
| `poll.end` | `{ activePoll: null }` |
| `pomodoro.tick` | `{ pomodoro: data }` |
| `context.update` | `{ currentActivity: data.activity ?? state.currentActivity, currentFile: data.file ?? state.currentFile, currentBranch: data.branch ?? state.currentBranch, currentTool: data.tool ?? state.currentTool, subjectLine: data.subject ?? state.subjectLine, currentSong: data.song ?? state.currentSong }` |
| `session.start` | `patch: { sessionId: data.id ?? state.sessionId }` **+ `effects: ['reset-duration-timer']`** |

Notes :
- **Horloge** : `alert.*` lit `context.now` (injecté), jamais `Date.now()` directement → pureté + test déterministe.
- **Effet timer** : `session.start` ne peut pas remettre le compteur local à zéro (effet) → il émet
  `'reset-duration-timer'`, que `store.js` exécute. Le timer `setInterval` lui-même reste dans la coquille.
- Ces 8 types n'ont **pas** d'idempotence ni d'event DOM : comportement inchangé par rapport à l'existant.

### `validateSceneConfig(config) → ValidationResult`

Fonction **pure** qui vérifie **algorithmiquement** les invariants d'une `SceneConfig`. Remplace
la review humaine (smoke test) par une garantie de couverture totale — exigence projet public.

Comme `reduceMessage`, cette fonction ne lève **jamais** — même sur un input structurellement
corrompu (config générée par un éditeur buggé). Les pré-checks V0 garantissent qu'aucun accès
ultérieur (`config.layers.filter`, `layer.visibility.full`…) ne plante.

Invariants vérifiés (chaque violation ajoute une entrée à `errors`) :

| # | Invariant | Message d'erreur si violé |
|---|---|---|
| V0a | `config` est un objet non-null | `config absente ou non-objet` |
| V0b | `config.layers` est un tableau | `layers absent ou non-tableau` |
| V0c | Chaque couche a `name` (string), `visibility` (objet), `components` (tableau) | `couche malformée à l'index <i>` |
| V1 | `id` ∈ `SceneId` | `id inconnu : <valeur>` |
| V2 | `dotgridMode` ∈ `DotGridMode` (incluant `null`) | `dotgridMode invalide : <valeur>` |
| V3 | `transition.type` ∈ `TransitionType`, `duration` ≥ 0 | `transition invalide` |
| V4 | Exactement **une** couche `name === 'goldbar'` | `goldbar manquante` / `goldbar dupliquée` |
| V5 | Couche `goldbar` : `visibility.minimal === true` | `goldbar doit survivre au niveau minimal` |
| V6 | Tous les `name` de couches **uniques** | `nom de couche dupliqué : <name>` |
| V7 | Chaque `LayerVisibility` respecte `hidden ⟹ minimal ⟹ full` | `visibilité incohérente sur <name>` |
| V8 | Chaque `component` ∈ `ComponentName` | `composant inconnu : <valeur>` |
| V9 | Au moins une couche avec `visibility.full === true` | `aucune couche visible en full` |

`ok === true` ⟺ `errors.length === 0`. Si V0a ou V0b échoue, on retourne immédiatement (les
checks suivants supposent une structure minimale). Consommée **maintenant** par la suite de tests,
qui asserte que les 3 configs de référence sont valides (caller concret → pas de code préemptif).

> Hors périmètre de `validateSceneConfig` : la **forme des `options`** d'un `ComponentMount`
> (ex : `GoldBar.position`). V8 ne vérifie que le **nom** du composant. Les options sont contrôlées
> par le composant à sa construction (S3) — pas ici. Documenté pour qu'on ne croie pas la couverture
> plus large qu'elle n'est.

## Comportements — `store.js` (coquille d'effets, AD-1)

`store.js` n'a plus aucun `switch` de protocole. `handleMessage` injecte le contexte, délègue,
puis exécute la décision (patch, events, warnings, effects) :

```js
/** Map jeton d'effet → effet concret. Seul effet actuel : reset du timer de durée local. */
const EFFECT_HANDLERS = {
  'reset-duration-timer': () => { durationSeconds = 0; },
};

function handleMessage(msg) {
  const { patch, events, warnings, effects } = reduceMessage(store, msg, { now: Date.now() });
  warnings.forEach(w => console.warn(w));
  if (patch) setState(patch);
  effects.forEach(token => EFFECT_HANDLERS[token]?.());
  events.forEach(e => document.dispatchEvent(new CustomEvent(e.name, { detail: e.detail })));
}
```

Garanties induites :
- **Pureté préservée** : `Date.now()` est lu dans la coquille et injecté ; `reduceMessage` reste
  déterministe (testable avec un `now` fixe).
- **Séquencement** : `setState` (donc `onStateChange`) s'exécute **avant** les `dispatchEvent`.
  Un listener `overlay:scene-change` lisant `store.currentScene` obtient déjà la valeur à jour.
- **Effets isolés** : seuls les jetons connus de `EFFECT_HANDLERS` agissent ; un jeton inconnu est ignoré.
- **No-op propre** : `patch === null` + `events === []` + `effects === []` ⟹ aucune mutation ni notification.
- Le store ne lit jamais les fichiers de config — il ne connaît pas la transition par défaut d'une
  scène. C'est le **runtime S3** qui, sur `overlay:scene-change`, lit la config de la scène entrante
  et applique `detail.transition` par-dessus si présent. Voir §Sélection de la transition.

### Récapitulatif des cas d'erreur (sortie `warnings` de `reduceMessage`)

`reduceMessage` ne lève jamais — chaque cas dégradé produit un `ReduceResult` explicite.
La colonne « ReduceResult » décrit la valeur retournée ; `store.js` la traduit en effets.

| Cas | ReduceResult |
|---|---|
| `scene.set` sans `data` | `patch: null`, `events: []`, `warnings: ['[overlay] scene.set : data manquant']` |
| `scene.set` avec `scene` non-string ou hors liste | `patch: null`, `events: []`, `warnings: ['[overlay] scene.set : scène inconnue — <valeur>']` |
| `scene.set` avec `transition` non-objet (ex : `'fast'`) | override ignoré, **scène changée** : `patch: { currentScene }`, event sans clé `transition`, `warnings: ['[overlay] scene.set : transition invalide — <valeur>']` |
| `scene.set` avec `transition.type` hors liste | override ignoré, **scène changée** : event sans clé `transition`, `warnings: ['[overlay] scene.set : type de transition inconnu — <valeur>']` |
| `visibility.set` sans `data` | `patch: null`, `events: []`, `warnings: ['[overlay] visibility.set : data manquant']` |
| `visibility.set` avec `level` non-string ou hors liste | `patch: null`, `events: []`, `warnings: ['[overlay] visibility.set : niveau inconnu — <valeur>']` |
| `morph.trigger` sans `data` | `events: [{ name: 'overlay:morph', detail: {} }]`, `warnings: []` (le handler DotGrid gère l'absence de clés) |
| `morph.trigger` avec `data` non-objet (ex : `'star'`, `42`) | `events: [{ name: 'overlay:morph', detail: {} }]`, `warnings: ['[overlay] morph.trigger : data invalide — <valeur>']` |

> Décision : un override de transition invalide ne bloque **pas** le changement de scène.
> Changer de scène est l'intention principale ; la transition est cosmétique. On dégrade
> gracieusement vers la transition par défaut de la scène plutôt que de refuser le changement.

### Initialisation de l'état

`STATIC_FALLBACK` dans `store.js` doit inclure :
```js
currentScene:    'brb',
visibilityLevel: 'full',
```

Raison du défaut `'brb'` : si l'overlay se charge sans WS actif, la scène BRB
(avec son message de pause) est la représentation la plus appropriée.

### Séquencement des CustomEvents vs setState

`setState` est appelé **avant** `dispatchEvent` — les abonnés `onStateChange` voient
le nouvel état avant que le CustomEvent soit dispatché. Cela garantit qu'un listener
`overlay:scene-change` qui lirait `store.currentScene` obtient déjà la valeur à jour.

### Sélection de la transition

Question : lors d'un passage de scène A → B, quelle transition s'applique ?

**Règle : la transition de la scène ENTRANTE (B).** La nouvelle scène arrive selon ses propres
termes — c'est la convention UX standard, et ça permet à chaque scène de définir son entrée
sans connaître toutes les scènes dont elle peut provenir.

**Résolution en cascade (appliquée par le runtime S3), de la plus haute à la plus basse priorité :**

1. Override de message : si `scene.set.data.transition` est fourni (et valide), ses champs
   présents priment, champ par champ.
2. Défaut de la scène entrante : `sceneConfig.transition` de la scène B comble les champs
   non fournis par l'override.
3. **Repli ultime** : tout champ encore manquant ou invalide à ce stade (config corrompue,
   scène inconnue côté runtime) est comblé par `DEFAULT_TRANSITION` (AD-3). La résolution
   produit **toujours** une `SceneTransition` complète — jamais `undefined`, jamais d'exception.

Exemple — entrée dramatique forcée sur BRB (override partiel : seule la durée change) :
```js
// Message entrant
{ type: 'scene.set', data: { scene: 'brb', transition: { duration: 1200 } } }

// Transition résolue par le runtime S3 :
//   override.duration (1200) prime
//   brb.config.transition fournit type:'crossfade', easing:'easeInOut'
// → { type: 'crossfade', duration: 1200, easing: 'easeInOut' }
```

Cut immédiat forcé (urgence) :
```js
{ type: 'scene.set', data: { scene: 'codage', transition: { type: 'cut' } } }
// → type 'cut' : duration et easing ignorés par le moteur
```

**Pour créer une nouvelle transition** (au-delà de `crossfade`/`cut`) : ajouter la valeur à
`TransitionType` dans `types.js`, implémenter le branchement dans le moteur d'animation S3.
Le format de config et le protocole n'ont pas à changer — ils transportent déjà un `type` libre
parmi les valeurs de l'union.

## Comportement par défaut — l'état de repos (AD-3)

Principe : **il existe toujours un point neutre sûr vers lequel retomber.** Aucun cas dégradé ne
laisse l'overlay dans un état d'animation indéfini ou figé.

### Transitions

`DEFAULT_TRANSITION = { type: 'crossfade', duration: 400, easing: 'easeInOut' }`.
Toute transition non résolue retombe dessus (voir §Sélection de la transition, étape 3). La règle
est portée par le runtime S3, mais la **constante** est définie en S2 dans `protocol.js` pour que
la valeur de repli soit unique et partagée.

### DotGrid — mode ambiant comme état de repos

Le DotGrid a toujours un mode ambiant (couches 1+2). On pose deux règles, consommées par le runtime
S3 et la couche DotGrid, mais **cadrées ici** car elles définissent le contrat de robustesse :

1. **Fin d'animation spéciale → retour au repos.** Quand un morphisme ou un événement (follow, sub…)
   se termine *ou échoue* (image introuvable, SDF invalide), le DotGrid revient à son mode ambiant
   de la scène courante. Pas d'écran figé sur une forme à moitié rendue.
2. **Mode ambiant invalide → `DEFAULT_DOTGRID_MODE`.** Si la scène courante déclare un `dotgridMode`
   hors `DotGridMode` (config corrompue), le DotGrid retombe sur `DEFAULT_DOTGRID_MODE` (`'brb'`,
   le plus calme) plutôt que de cesser d'animer.

> Périmètre S2 : on **définit** les constantes (`DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE`) et le
> contrat de repli. Le **moteur** qui les applique (runtime, animation DotGrid) est en S3 / couche 3.
> Les définir maintenant garantit une valeur de repli unique dès que le moteur la consomme.

## Contrat d'événements

| Événement | `detail` | Dispatché par |
|---|---|---|
| `overlay:scene-change` | `{ scene: SceneId, transition?: Partial<SceneTransition> }` | `store.js` handler `scene.set` |
| `overlay:visibility-change` | `{ level: VisibilityLevel }` | `store.js` handler `visibility.set` |
| `overlay:morph` | `MorphTriggerData` (ou `{}` si `data` absent) | `store.js` handler `morph.trigger` |

`detail.transition` n'est présent que si un override valide a été fourni dans le message `scene.set`.
En son absence, le runtime applique la transition par défaut de la scène entrante (voir §Sélection de la transition).

Ces événements sont la surface de communication entre le store et le runtime de scène (S3)
ou les composants qui réagissent au morphisme (DotGridAnimated couche 3).

## Sécurité

Le projet est destiné à une **diffusion publique** (réutilisable par d'autres streamers, voir
`docs/overview.md`). La sécurité est donc traitée comme un critère de livraison, pas un détail.

### Modèle de menace — état S2

| Surface | Évaluation S2 |
|---|---|
| `ws://localhost:4455` | Trafic **local uniquement**, non exposé au réseau. Source = OBS ou relais local. |
| Messages `{type,data}` entrants | Validés dans la logique pure `reduceMessage` (testée V/AC) : type inconnu ignoré, `scene`/`level`/`transition.type` hors liste → `warnings` + rejet, jamais d'état illégal injecté. `store.js` n'applique que des `ReduceResult` validés. |
| `morph.trigger` | Dispatche un CustomEvent local. Sources locales uniquement (SDF/bitmap). Aucune sortie réseau. |
| Stockage | Aucun secret, aucune PII. Les configs de scène sont des données statiques publiques. |

### Règles applicables dès S2

1. **Validation au boundary** — `reduceMessage` (logique pure, testée algorithmiquement) est le
   point de validation unique. `store.js` n'applique qu'un `ReduceResult` déjà validé : toute valeur
   hors-domaine est rejetée avant d'atteindre `setState` ou un CustomEvent. Aucune donnée brute non
   validée ne se propage vers le runtime de scène.
2. **`imageUrl` de `morph.trigger`** — le morphisme bitmap (couche 3A) chargera une URL. Quand cette
   couche sera implémentée, l'URL devra être restreinte à des assets locaux du projet (préfixe relatif),
   jamais une URL arbitraire fournie par un message externe non fiable (risque SSRF / exfiltration via
   requête sortante). → Contrainte à porter dans la spec couche 3A. Notée ici car le champ existe déjà.
3. **Pas de génération IA / API externe** — décision produit (voir §Périmètre Exclu). Élimine la
   surface « prompt injection → coût API » et « clé API exposée dans du JS public ».

### Documentation requise pour la diffusion publique

À produire (séquencé S4/publication, voir FRIC-S2-04) : un `README` / section sécurité indiquant que
- `WS_URL` pointe sur `localhost` par défaut et **ne doit pas** être exposé sur une interface réseau
  publique sans le relais authentifié de S4 ;
- aucune entrée chat brute ne doit alimenter directement un `morph.trigger` ou un `scene.set`
  (un viewer ne doit pas pouvoir piloter l'overlay).

### Déféré à S4 (relais Bun)

Auth WebSocket (secret en variable d'environnement), rate-limiting sur l'endpoint `/emit`,
validation serveur des messages avant retransmission. Voir MAP S4.

## Stratégie de tests — autonome, `bun test` (AD-1)

Exigence : les tests doivent tourner **seuls**, en une commande, sans intervention humaine
(projet public). La séparation logique pure / effets (AD-1) rend ça possible sans navigateur,
sans build, sans dépendance npm : `bun test` est intégré à Bun et `protocol.js` est du JS natif
importable tel quel. Les `.test.js` ne sont **jamais** chargés dans OBS.

### `protocol.test.js` — réduction du protocole

Importe `reduceMessage`. Pour chaque cas, asserte le `ReduceResult` complet (`patch`, `events`,
`warnings`, `effects`) — garantie **algorithmique**, pas un échantillon. `context` = `{ now: 1000 }`
fixe (déterminisme). Couverture (numérotation continue) :

- **Nominal nouveaux types** : `scene.set`, `visibility.set`, `morph.trigger` valides (AC-01→05).
- **Types existants migrés** : les 8 types → `patch` du tableau, identique au legacy (AC-33), avec
  `alert.*` timestamp = `context.now` (AC-34), `session.start` effect (AC-35), `chat.message` cap 20 (AC-36).
- **Idempotence** : `scene.set`/`visibility.set` vers la valeur courante → no-op (AC-22).
- **Erreurs** : scène/niveau inconnus, `data` manquant/non-objet, `transition` non-objet/`type` inconnu (AC-07, 08, 20, 23, 25).
- **Guard malformé** : `message` = `null` / `42` / `'x'` / sans `type` → `ReduceResult` vide, ne lève pas (AC-32).
- **Override transition** : présent valide → clé `transition` dans le detail ; absent → clé absente (AC-19).
- **Pureté** : après `reduceMessage`, `state` **inchangé** (deep-equal) pour tous les types (AC-26) ;
  les 4 champs du `ReduceResult` toujours présents (AC-38).
- **Type inconnu** : `ReduceResult` vide, aucun warning (AC-27). **Constantes** : valeurs exactes (AC-31).

### `protocol.test.js` (suite config) — `validateSceneConfig`

Importe `validateSceneConfig` + les 3 configs de référence.

- **Smoke des références** : `validateSceneConfig(discussion|brb|codage).ok === true` (AC-28).
- **Pré-checks structurels V0** : `null`, `layers` absent/non-tableau, couche malformée → `ok:false`
  sans lever (AC-37).
- **Chaque invariant V1→V9** : une config minimale qui viole *un seul* invariant → `ok === false`
  avec le message attendu dans `errors`. Un test par invariant (AC-29).

> Couverture par construction : `validateSceneConfig` vérifie **tous** les cas (garantie
> algorithmique). Le test « smoke des références » n'est plus la garantie — il est juste un
> contrôle de non-régression sur les 3 fichiers livrés. La garantie vient de la fonction.

**Commande** : `bun test` à la racine. Convention de nommage : `*.test.js` à côté du module testé.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `CLAUDE.md` | modifier | Ajouter `{workflows}` mapping + mettre à jour ref shared surface ✅ |
| `docs/workflows/spec-template.md` | créer | Template réutilisable pour toutes les specs du projet ✅ |
| `docs/specs/_index.md` | créer | Index des specs ✅ |
| `types.js` | modifier | Ajouter 17 typedefs (SceneId → ValidationResult) + étendre `StreamState` (currentScene, visibilityLevel) |
| `protocol.js` | **créer** | Logique pure : `reduceMessage` (11 types), `validateSceneConfig` (V0→V9), constantes `DEFAULT_TRANSITION` / `DEFAULT_DOTGRID_MODE`. Zéro DOM/réseau/temps. |
| `store.js` | modifier | Refactor en coquille : supprimer le `switch`, `handleMessage` injecte `{ now }` → `reduceMessage` → applique patch/effects/events/warnings. `EFFECT_HANDLERS` (reset timer). `STATIC_FALLBACK` (currentScene, visibilityLevel) |
| `protocol.test.js` | **créer** | Tests `bun test` autonomes : réduction des 11 types + guard malformé + pureté + V0→V9 + smoke des 3 configs |
| `scenes/discussion.config.js` | créer | Config de référence |
| `scenes/brb.config.js` | créer | Config de référence |
| `scenes/codage.config.js` | créer | Config de référence |

> `store.js` n'expose plus de logique testable directement : toute la décision est dans `protocol.js`,
> testé en isolation. `handleMessage` reste privé au module (pas besoin de l'exporter).

> Cross-check avant "done" :
> - [ ] Chaque AC → implémenté et vérifié par `bun test` (ou review pour les AC statiques)
> - [ ] Les 17 typedefs dans `types.js` → chacun utilisé par `protocol.js`, un config, ou le store
> - [ ] `bun test` passe : `protocol.test.js` vert (11 types + guard + pureté + V0→V9 + smoke des 3 configs)
> - [ ] **Non-régression** : les 8 types existants produisent le même `patch` qu'avant le refactor
> - [ ] `store.js` ne contient plus de `switch` de protocole ; tout passe par `reduceMessage`
> - [ ] `validateSceneConfig(discussion|brb|codage).ok === true`
> - [ ] `protocol.js` ne contient aucun accès DOM / réseau / `Date.now()` / `setInterval` (logique pure)
> - [ ] `store.js` — tous les warnings produits par `reduceMessage` au format `[overlay] <type> : <raison> — <valeur>` (avec `— <valeur>` seulement si une valeur fautive existe)
> - [ ] Aucun champ `prompt` ni appel réseau introduit dans le code morphisme

## Frictions ouvertes et travaux séquencés

Aucune friction connue n'est cachée. Chacune est ici, avec son statut, sa session cible et la
condition qui la transformerait en bug si on l'ignorait. Rien n'est « exclu » par confort —
tout est soit **résolu en S2**, soit **séquencé** avec une raison explicite.

**Résolues en S2 (plus de friction) :**
- ✅ Validation algorithmique des configs → `validateSceneConfig` (V0→V9), testée. (ex-friction « smoke test »)
- ✅ Tests autonomes → `protocol.test.js` sous `bun test`, plus aucune vérification manuelle.
- ✅ État illégal `LayerVisibility` → invariant `hidden⟹minimal⟹full` vérifié par V7.
- ✅ État d'animation indéfini → `DEFAULT_TRANSITION` + mode de repos DotGrid (AD-3).
- ✅ Modèle de rendu page-unique → frontière logique/placement décidée (AD-2 : placement = CSS).
- ✅ **Régression du refactor évitée** → `reduceMessage` migre les 8 types existants (non-régression
  testée), `store.js` ne perd aucun handler. Horloge injectée + effet `reset-duration-timer` pour
  préserver la pureté sur `alert.*` et `session.start`.
- ✅ Fonctions de boundary qui ne lèvent jamais → guard message malformé + pré-checks V0.

**Séquencées (raison + condition de déclenchement en bug) :**

```
[ ] FRIC-S2-01 — 5 configs restantes (interview, react, creation, fin, jeu)
    Statut   : séquencé S3 (créées à la migration de chaque scène en page-unique)
    Raison   : le format est figé par les 3 références + validateSceneConfig ; les 5 suivent le patron
    Bug si   : le runtime S3 charge une scène avant que sa config existe → validateSceneConfig
               la rejette explicitement (pas de crash silencieux). Filet déjà en place.

[ ] FRIC-S2-02 — Forme exacte de MorphTriggerData.sdf
    Statut   : séquencé couche 3B DotGrid (design non commencé)
    Raison   : la géométrie SDF dépend du moteur DotGrid, hors S2
    Bug si   : un message `morph.trigger` avec `sdf` arrive avant la couche 3B → le store relaie,
               le handler DotGrid (absent) ne fait rien. Aucun effet de bord. Sûr.

[ ] FRIC-S2-03 — Restriction de `imageUrl` (morph bitmap) aux assets locaux
    Statut   : séquencé couche 3A DotGrid + à porter dans sa spec
    Raison   : le chargement bitmap n'existe pas encore ; la règle accompagne son implémentation
    Bug si   : la couche 3A charge une `imageUrl` arbitraire d'un message non fiable (SSRF /
               exfiltration). → Contrainte de sécurité OBLIGATOIRE à écrire avec la couche 3A.
               Tracé aussi en §Sécurité règle 2.

[ ] FRIC-S2-04 — Documentation sécurité pour diffusion publique (README)
    Statut   : séquencé avec le relais S4 / la publication
    Raison   : la doc décrit le déploiement (WS_URL local, pas d'entrée chat → pilotage), qui
               se stabilise avec S4
    Bug si   : un tiers publie l'overlay et expose `WS_URL` sans relais authentifié → pilotage
               non autorisé. → Doc + auth S4 sont la réponse. À ne pas oublier avant publication.

[ ] FRIC-S2-05 — Format d'échange de l'éditeur de scènes (S5)
    Statut   : ouvert, sera tranché au design de l'éditeur (S5)
    Raison   : décision AD-2 = le placement vit dans le CSS. L'éditeur devra donc lire/écrire du
               CSS (ou un sur-ensemble), pas un JSON de coordonnées. La forme exacte de cette
               interaction (l'éditeur génère-t-il du CSS ? un format intermédiaire ?) est à concevoir.
    Bug si   : on construit l'éditeur en supposant que SceneConfig porte le placement → faux (AD-2).
               Posé maintenant pour éviter cette hypothèse.
```
