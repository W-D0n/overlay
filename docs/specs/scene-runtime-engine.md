---
feature: scene-runtime-engine
created: 2026-06-08
updated: 2026-06-08
status: reviewed
---

# Spec : scene-runtime-engine

## Contexte

S2 a livré le **format** (`SceneConfig`) et la **logique pure** du protocole (`reduceMessage`,
`validateSceneConfig`, `DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE`) + 3 configs de référence.
`store.js` dispatche désormais 3 CustomEvents : `overlay:scene-change`, `overlay:visibility-change`,
`overlay:morph` (voir `docs/specs/scene-config-protocol.md` §Contrat d'événements).

S3 livre le **moteur qui consomme ce format** : une **page unique** (`index.html`) qui remplace les
7 Browser Sources HTML séparées. Le moteur lit un `SceneConfig`, monte ses couches par `data-layer`,
applique le niveau de visibilité, et exécute les transitions de scène (résolution en cascade →
`DEFAULT_TRANSITION`). Le DotGrid devient une **couche de fond permanente** (`#bg-layer`), une seule
instance qui survit aux changements de scène pour assurer la continuité visuelle.

Référence : `docs/overview.md` §Page unique vs multi-fichiers, §Couches nommées, §Couche de fond (DotGrid).

## Décisions d'architecture

Quatre décisions, validées avec l'owner, cadrent S3. Elles prolongent AD-1/AD-2/AD-3 de S2.

### AD-4 — Périmètre atomique : moteur + 3 scènes de référence

S3 construit le runtime **et** migre les 3 scènes dont la config existe déjà (`discussion`, `brb`,
`codage`). Les 5 restantes (`interview`, `react`, `creation`, `fin`, `jeu`) + leurs configs →
**S3b**. Raison : session atomique (un moteur prouvé de bout en bout sur 3 scènes réelles) +
`zero preemptive code` (les 5 configs n'existent pas encore ; les créer maintenant serait du code
sans format figé par l'usage). Filet : `validateSceneConfig` rejette explicitement toute config
absente ou invalide chargée par erreur (pas de crash silencieux — FRIC-S2-01).

### AD-5 — Structure + placement : `<template>` inline dans `index.html`

Conformément à AD-2 (placement = CSS/HTML, jamais `SceneConfig`), chaque scène déclare sa structure
DOM et son placement dans un `<template data-scene="id">` inline dans `index.html`. Ses éléments
racine portent `data-layer="<name>"`, en correspondance 1:1 avec les `LayerConfig.name` de la config.
Le runtime **clone** le template dans un conteneur de scène, puis monte les composants déclarés par
la config dans l'élément `[data-layer=name]` correspondant. Zéro `fetch`, zéro build, zéro requête
réseau pour la structure : tout vit dans une page chargée en une fois (contrainte OBS / zero-build).

### AD-6 — Liaison données : module de câblage par scène (`scenes/[id].wire.js`)

`SceneConfig` ne porte **pas** de data-binding (ce sera un jalon de l'éditeur, voir `docs/inbox.md`).
Le câblage composant ↔ état live (ex : `StatBlock` VIEWERS → `state.viewers`) vit dans un module
dédié par scène : `scenes/[id].wire.js`. Il reçoit les instances de composants montées (groupées par
couche) et les abonne au store via `onStateChange`, puis retourne une fonction de nettoyage. Raison :
préserver la séparation actuelle — les composants de `components/index.js` **n'importent pas** `store.js`
(ils restent agnostiques de la source de données). Le binding reste du **code** par scène jusqu'à ce
qu'un besoin concret justifie le jalon « data-binding déclaratif » de l'éditeur.

### AD-7 — `hidden` masque tout, y compris le fond

Le niveau `hidden` (cinématique plein écran) masque **toutes** les couches de scène **et** `#bg-layer`
(DotGrid), et rend le `body` transparent (`body.style.background = 'transparent'`). Cohérent avec
`types.js` (`hidden` = « aucune couche visible, body transparent »). `full` et `minimal` ré-affichent
`#bg-layer` et restaurent le fond. La transparence est appliquée dynamiquement (overview §Deux axes
orthogonaux), pas figée par scène.

> **Morph hors S3** : `DotGridAnimated.morphTo` / `trigger` sont des stubs (couche 3). Le runtime S3
> **ne câble pas** `overlay:morph` — on ne branche pas sur un stub (`zero preemptive code`). Séquencé
> couche 3 DotGrid.

## Périmètre

**Inclus :**
- `index.html` page unique : `#bg-layer`, `#scene-root`, un `<template data-scene>` par scène de référence.
- `scene-runtime.js` : orchestrateur DOM — montage initial, swap de scène + transition, application
  du niveau de visibilité. Écoute `overlay:scene-change` et `overlay:visibility-change`.
- `scene-resolve.js` : helpers **purs** consommés par le runtime — `resolveTransition`,
  `isLayerVisible`, `resolveDotgridMode`. Zéro DOM/réseau/temps (prolonge AD-1).
- Moteur de transition : `crossfade` (fondu croisé d'opacité) **et** `cut` (instantané) — les 2
  seules valeurs de `TransitionType`.
- `component-registry.js` : `ComponentName` → factory (les 5 composants existants).
- `scenes/registry.js` : `SceneId` → `SceneConfig` (les 3 scènes de référence).
- 3 modules de câblage : `scenes/{discussion,brb,codage}.wire.js` (AD-6).
- Migration des 3 scènes de référence vers la page unique (structure portée par les `<template>`).
- `scene-resolve.test.js` : tests `bun test` autonomes des helpers purs.

**Exclu :**
- 5 scènes restantes (`interview`, `react`, `creation`, `fin`, `jeu`) + leurs configs → **S3b** (AD-4).
- Câblage de `overlay:morph` et morphisme DotGrid (couches 3A/3B) → sessions ultérieures.
- Relais Bun (WS + HTTP `/emit`, auth) → S4.
- Éditeur de scènes (placement drag, écriture de config) → S5.
- Nouvelles valeurs de `TransitionType` au-delà de `crossfade`/`cut` → besoin concret futur.

## Acceptance Criteria

> « Vérifiable par » : **bun test** = garantie algorithmique automatisée (helpers purs).
> **review fichier** = vérification statique (structure/contenu). **visuel OBS** = rendu observé dans
> une Browser Source 1920×1080 (orchestration DOM, non testable sans navigateur — voir AD-1 : seule
> la logique pure est testée ; l'orchestration est vérifiée visuellement).

### Structure de page & montage initial

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `index.html` contient `#bg-layer` (conteneur du DotGrid permanent) et `#scene-root` (conteneur des scènes) | review fichier |
| AC-02 | Une seule instance `DotGridAnimated` est créée, montée dans `#bg-layer`, et **jamais détruite** lors d'un changement de scène | review + visuel OBS |
| AC-03 | `index.html` contient un `<template data-scene="id">` pour chacune des 3 scènes (`discussion`, `brb`, `codage`) | review fichier |
| AC-04 | Pour chaque couche de la config d'une scène, son `<template>` déclare exactement un élément `[data-layer=<name>]` (correspondance 1:1) | review (croisé config) |
| AC-05 | Au chargement, le runtime monte `store.currentScene` (défaut `'brb'`) **sans transition** (cut) puis applique `store.visibilityLevel` (défaut `'full'`) | visuel OBS |
| AC-40 | Scène initiale absente du registry (`store.currentScene` hors S3) → warning + repli sur `'brb'` ; si `'brb'` absent → `#scene-root` vide + warning | review |

### Registries

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-06 | `component-registry.js` mappe chaque `ComponentName` (`GoldBar`, `StatBlock`, `ChatFeed`, `PomodoroBar`, `AlertBanner`) vers sa factory de `components/index.js` | review fichier |
| AC-07 | `scenes/registry.js` mappe chaque `SceneId` implémenté (`discussion`, `brb`, `codage`) vers son `SceneConfig` importé | review fichier |

### Montage d'une scène (mount)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-08 | Pour chaque `LayerConfig`, le runtime monte les `components` (dans l'ordre déclaré) dans l'élément `[data-layer=<name>]` du template cloné | visuel OBS + review |
| AC-09 | `ComponentMount.component` absent du registry → warning `[overlay] mount : composant inconnu — <nom>`, composant ignoré, montage poursuivi | review |
| AC-10 | Couche déclarée en config sans `[data-layer=<name>]` correspondant dans le template → warning `[overlay] mount : couche absente du template — <name>`, couche ignorée | review |
| AC-11 | Avant montage, le runtime appelle `validateSceneConfig(config)` ; si `!ok` → `errors` loggués + montage **annulé** (scène courante conservée) | review (appelle `validateSceneConfig`, testée S2) |

### Câblage à l'état (wire — AD-6)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-12 | Après montage, le runtime appelle `scenes/[id].wire.js` qui abonne les composants au store via `onStateChange` et retourne une fonction de nettoyage | review fichier |
| AC-13 | Au démontage d'une scène, le runtime appelle la fonction de nettoyage du wire (désabonnement) puis `destroy()` de chaque composant qui l'expose | review + visuel OBS |
| AC-14 | Les composants de `components/index.js` n'importent **pas** `store.js` (séparation préservée — le binding vit dans les wire modules) | review (grep) |
| AC-39 | `AlertBanner` expose `destroy()` (`clearTimeout` du `hideTimer`) ; le runtime l'appelle au démontage de la scène | review |

### Résolution de transition (`scene-resolve.js`, pur)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-15 | `resolveTransition(override, sceneDefault)` retourne **toujours** une `SceneTransition` complète (`type`, `duration`, `easing`) — jamais `undefined` | bun test |
| AC-16 | Priorité de résolution, champ par champ : `override` > `sceneDefault` > `DEFAULT_TRANSITION` | bun test |
| AC-17 | Champ d'`override` invalide (`type` hors `TransitionType`, `duration` non-number ou < 0, `easing` hors `TransitionEasing`) → ignoré, repli sur la priorité inférieure | bun test |
| AC-18 | `override` et `sceneDefault` absents/`undefined` → `DEFAULT_TRANSITION` exact | bun test |
| AC-37 | `toCssEasing(easing)` mappe chaque `TransitionEasing` vers sa timing-function CSS (`easeInOut→ease-in-out`, `easeIn→ease-in`, `easeOut→ease-out`, `linear→linear`) ; valeur hors domaine → `'ease-in-out'` | bun test |

### Changement de scène (transition — runtime)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-19 | Sur `overlay:scene-change`, transition résolue = `resolveTransition(detail.transition, enteringConfig.transition)` | review + visuel OBS |
| AC-20 | Transition `cut` → ancienne scène retirée immédiatement, nouvelle affichée sans fondu | visuel OBS |
| AC-21 | Transition `crossfade` → nouvelle scène opacité 0→1 et ancienne 1→0 sur `duration` ms avec `easing`, puis ancienne démontée | visuel OBS |
| AC-22 | Sur `overlay:scene-change`, soit `m = resolveDotgridMode(enteringConfig.dotgridMode)` : `grid.setMode(m)` appelé **uniquement si** `m !== null` ; le DotGrid **n'est jamais recréé** | review + visuel OBS |
| AC-23 | `overlay:scene-change` vers un `scene` absent de `scenes/registry.js` → warning `[overlay] scene-change : scène inconnue — <id>`, aucun swap (scène courante conservée) | review |
| AC-24 | Après une transition, `#scene-root` ne contient qu'**une seule** scène (l'ancienne démontée, wire nettoyé — pas d'accumulation) | review + visuel OBS |
| AC-38 | Le `crossfade` applique `toCssEasing(resolved.easing)` comme timing-function CSS (jamais le jeton `TransitionEasing` brut) | review |

### Résolution du mode DotGrid (`scene-resolve.js`, pur)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-25 | `resolveDotgridMode(null)` → `null` (scène sans DotGrid) | bun test |
| AC-26 | `resolveDotgridMode(<mode valide>)` → ce mode (validé contre `GRID_MODES` exporté par `DotGridAnimated.js`) | bun test |
| AC-27 | `resolveDotgridMode(<valeur invalide non-null>)` → `DEFAULT_DOTGRID_MODE` (`'brb'`, AD-3) | bun test |
| AC-28 | Mode résolu à `null` → `#bg-layer` masqué pour cette scène ; mode non-null → `#bg-layer` visible | visuel OBS |

### Niveau de visibilité

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-29 | `isLayerVisible(visibility, level)` (pur) ≡ `visibility[level] === true` | bun test |
| AC-30 | Sur `overlay:visibility-change`, chaque couche de la scène courante est affichée/masquée selon `isLayerVisible(layer.visibility, level)` | visuel OBS |
| AC-31 | Niveau `minimal` → seules les couches `visibility.minimal === true` restent visibles ; `#bg-layer` reste visible | visuel OBS |
| AC-32 | Niveau `hidden` → **toutes** les couches masquées, `#bg-layer` masqué, `body.style.background = 'transparent'` (AD-7) | visuel OBS |
| AC-33 | Retour `hidden`/`minimal` → `full` : fond restauré (`body.style.background = ''`), `#bg-layer` ré-affiché, couches `full` ré-affichées | visuel OBS |
| AC-34 | Le niveau de visibilité courant est ré-appliqué à toute nouvelle scène montée (un `scene-change` pendant `minimal`/`hidden` conserve le niveau) | visuel OBS |
| AC-41 | `#scene-root` et les conteneurs `.scene` n'ont **pas** de fond opaque (la transparence en `hidden` provient du `body` ; le fond visuel d'une scène vient du `body`/tokens, pas du conteneur) | review |

### Pureté & non-câblage

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-35 | `scene-resolve.js` ne touche ni DOM, ni réseau, ni temps (`Date.now`/`setInterval`/`setTimeout`) — fonctions pures | review (grep) |
| AC-36 | Le runtime S3 ne câble **pas** `overlay:morph` (séquencé couche 3) | review |

> Règle : chaque AC est vérifiable de façon autonome. « Fonctionne correctement » n'est pas un AC.

## Types JSDoc

À ajouter dans `types.js` (après les typedefs S2). Exhaustif : chaque champ, son type, sa contrainte.

```js
/**
 * Instance de composant montée — surface retournée par une factory de `components/index.js`.
 * Toutes les méthodes sont optionnelles : un composant DOM pur n'expose que `el`.
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el                       - Élément racine, inséré dans l'élément de couche
 * @property {(data: unknown) => void} [update]     - Rafraîchit le composant (signature précise sur la factory — voir note)
 * @property {(alert: unknown) => void} [show]      - Affiche une alerte (AlertBanner — type précis sur la factory)
 * @property {() => void} [destroy]                 - Libère les ressources (observers, timers)
 */

/**
 * Scène montée dans le DOM par le runtime — résultat de `mountScene(id)`.
 * @typedef {Object} MountedScene
 * @property {SceneId} id
 * @property {HTMLElement} root                                       - Conteneur de la scène (enfant de #scene-root)
 * @property {Record<string, ComponentInstance[]>} componentsByLayer - Instances groupées par `name` de couche, dans l'ordre de la config
 * @property {() => void} destroy                                     - Démontage complet : cleanup du wire, `destroy()` de chaque composant, retrait de `root`
 */

/**
 * Module de câblage d'une scène (AD-6) : abonne les composants montés au store.
 * @callback SceneWire
 * @param {MountedScene} mounted
 * @returns {() => void} Fonction de désabonnement (cleanup), appelée au démontage
 */
```

> `ComponentInstance` formalise la forme déjà retournée par les factories existantes (`{ el }`,
> `{ el, update }`, `{ el, show }`, `{ el, destroy }`). Seul `AlertBanner` est modifié (ajout de
> `destroy()`, gap [2] de la review). `MountedScene.destroy` est composé par le runtime **après**
> câblage (wire cleanup + `destroy()` des composants + `root.remove()`), voir §Comportements.
>
> **Type effacé (assumé)** : `update`/`show` sont typés `unknown` (et non `*`/`any`, règle CLAUDE)
> car `ComponentInstance` est la vue **unifiée** du registry pour 5 composants aux signatures
> hétérogènes (`StatBlock` `{label,value}`, `ChatFeed` `ChatMessage[]`, `PomodoroBar` `PomodoroState`,
> `AlertBanner` `AlertEvent`). Les types **précis** vivent sur les factories de `components/index.js`
> (inchangées) ; un wire qui a besoin de précision caste l'instance vers le type concret.

## Format de données

### `<template data-scene="id">` — structure + placement (AD-5)

Les éléments racine du template portent `data-layer`, en correspondance 1:1 avec les
`LayerConfig.name`. Le placement vit dans les classes CSS (AD-2 : `tokens.css` + styles de
`index.html`), jamais dans la config. Les couches `components: []` portent du **DOM pur** ; les
couches avec composants reçoivent les `.el` montés comme enfants de l'élément `[data-layer]`.

```html
<!-- index.html (extrait) — structure de la scène BRB -->
<template data-scene="brb">
  <div data-layer="goldbar"></div>                  <!-- GoldBar top + bottom montés ici -->

  <div data-layer="message" class="brb-block-left"> <!-- DOM pur : placement + textes live -->
    <div class="brb-tag">— Pause —</div>
    <div class="brb-name">D0n</div>
    <div class="brb-message">Retour dans quelques minutes.</div>
    <div class="brb-activity">sur l'atelier.</div>  <!-- maj par brb.wire.js -->
    <div class="brb-song">—</div>                   <!-- maj par brb.wire.js -->
  </div>

  <div data-layer="chat" class="brb-block-right"></div>   <!-- ChatFeed monté ici -->
  <div data-layer="stats" class="brb-stats"></div>        <!-- 2 StatBlock montés ici (ordre config) -->

  <div data-layer="next-stream" class="brb-next">
    <span class="next-info">À venir</span>          <!-- maj par brb.wire.js -->
    <span class="next-topic"></span>                <!-- maj par brb.wire.js -->
  </div>
</template>
```

### `scenes/[id].wire.js` — câblage (AD-6)

Module ES exportant `wire(mounted) → cleanup`. Lit les composants par couche et les éléments DOM pur
par sélecteur, abonne au store. `onStateChange` retourne déjà la fonction de désabonnement → `wire`
la relaie comme `cleanup`. Le wire **importe** `store.js` (les composants, eux, ne l'importent jamais).

```js
// @ts-check
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [statViewers, statDuration] = mounted.componentsByLayer.stats;
  const [chat] = mounted.componentsByLayer.chat;
  const activityEl = mounted.root.querySelector('.brb-activity');
  const songEl     = mounted.root.querySelector('.brb-song');
  const nextEl     = mounted.root.querySelector('.next-info');
  const topicEl    = mounted.root.querySelector('.next-topic');

  return onStateChange((state) => {
    statViewers.update?.({ value: state.viewers > 0 ? state.viewers.toLocaleString('fr-FR') : '—' });
    statDuration.update?.({ value: state.duration });
    chat.update?.(state.chatMessages);
    if (activityEl) activityEl.textContent = state.currentActivity ? `sur ${state.currentActivity}.` : 'sur l\'atelier.';
    if (songEl)     songEl.textContent     = state.currentSong || '—';
    if (nextEl)     nextEl.textContent     = state.nextStream || 'À venir';
    if (topicEl)    topicEl.textContent    = state.nextStreamTopic || '';
  });
}
```

### `component-registry.js` — `ComponentName` → factory

```js
// @ts-check
import { GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner } from './components/index.js';

/** @type {Record<import('./types.js').ComponentName, (options: Record<string, unknown>) => import('./types.js').ComponentInstance>} */
export const COMPONENT_REGISTRY = { GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner };
```

### `scenes/registry.js` — `SceneId` → config + wire

Un seul module agrège les ressources de scène (config sérialisable **et** wire), consommé par le
runtime. Aggregation intentionnelle (pas un barrel de ré-export passif).

```js
// @ts-check
import { sceneConfig as discussion } from './discussion.config.js';
import { sceneConfig as brb }        from './brb.config.js';
import { sceneConfig as codage }     from './codage.config.js';
import { wire as wireDiscussion }    from './discussion.wire.js';
import { wire as wireBrb }           from './brb.wire.js';
import { wire as wireCodage }        from './codage.wire.js';

/** @type {Record<string, import('../types.js').SceneConfig>} */
export const SCENE_CONFIGS = { discussion, brb, codage };

/** @type {Record<string, import('../types.js').SceneWire>} */
export const SCENE_WIRES = { discussion: wireDiscussion, brb: wireBrb, codage: wireCodage };
```

## Comportements

### Helpers purs — `scene-resolve.js`

Quatre fonctions pures (zéro DOM/réseau/temps), testées par `scene-resolve.test.js`. Importent
`DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE` depuis `protocol.js` et `GRID_MODES` depuis
`DotGridAnimated.js` (sources uniques — DRY).

**`resolveTransition(override, sceneDefault) → SceneTransition`**
Construit depuis `DEFAULT_TRANSITION`, applique les champs valides de `sceneDefault`, puis ceux
d'`override` (priorité croissante). Validation champ par champ : `type ∈ TransitionType`,
`duration` number ≥ 0, `easing ∈ TransitionEasing`. Un champ invalide est ignoré (la priorité
inférieure déjà posée subsiste). Retourne toujours une `SceneTransition` complète (AC-15→18).

**`isLayerVisible(visibility, level) → boolean`**
Retourne `visibility[level] === true`. Aucune autre logique (l'invariant `hidden ⟹ minimal ⟹ full`
est garanti à la construction par `validateSceneConfig` V7). (AC-29)

**`resolveDotgridMode(dotgridMode) → DotGridMode`**
`null → null` (scène sans DotGrid) ; `mode ∈ GRID_MODES → mode` ; sinon → `DEFAULT_DOTGRID_MODE`
(`'brb'`, AD-3). (AC-25→27)

**`toCssEasing(easing) → string`**
Mappe une valeur `TransitionEasing` (camelCase, S2) vers la timing-function CSS correspondante :
`{ easeInOut:'ease-in-out', easeIn:'ease-in', easeOut:'ease-out', linear:'linear' }`. Valeur hors
domaine → `'ease-in-out'` (repli, cohérent avec `DEFAULT_TRANSITION.easing`). **Nécessaire** : les
jetons `TransitionEasing` ne sont **pas** des timing-functions CSS valides — les injecter bruts dans
`transition: …` casserait silencieusement l'easing du crossfade. (AC-37, consommé par AC-38)

### Cas nominaux — `scene-runtime.js`

**Montage initial (au chargement de `index.html`)**
1. Crée l'instance **unique** `DotGridAnimated`, l'insère dans `#bg-layer`.
2. Lit `store.currentScene` (défaut `'brb'`) et `store.visibilityLevel` (défaut `'full'`).
3. `mountScene(currentScene)` (sans transition — équivalent `cut`), insère dans `#scene-root`.
4. `m = resolveDotgridMode(config.dotgridMode)` ; `m === null` → masque `#bg-layer` (pas de `setMode`) ; sinon `grid.setMode(m)` + affiche `#bg-layer`.
5. `applyVisibility(visibilityLevel)`.
6. Abonne les listeners `overlay:scene-change` et `overlay:visibility-change`. (`overlay:morph` **non** abonné — AD-7.)

**`mountScene(id) → MountedScene | null`**
1. `config = SCENE_CONFIGS[id]` ; absent → warning, retourne `null`.
2. `validateSceneConfig(config)` ; `!ok` → logge chaque `error`, retourne `null` (AC-11).
3. Clone `<template data-scene=id>` dans un conteneur `.scene`.
4. Pour chaque `LayerConfig` : trouve `[data-layer=name]` ; absent → warning (AC-10), couche ignorée.
   Pour chaque `ComponentMount` (ordre config) : `factory = COMPONENT_REGISTRY[component]` ; absent →
   warning (AC-09), ignoré ; sinon `instance = factory(options)`, insère `instance.el` comme
   **dernier enfant** de l'élément de couche (AC-08), collecte dans `componentsByLayer[name]`.
5. Insère le conteneur dans `#scene-root`.
6. `cleanup = SCENE_WIRES[id](mounted)`.
7. Compose `mounted.destroy = () => { cleanup(); instances.forEach(i => i.destroy?.()); container.remove(); }`.
8. Retourne `mounted`.

**Swap de scène (`overlay:scene-change`)**
1. `{ scene, transition }` = `event.detail`.
2. `entering = SCENE_CONFIGS[scene]` ; absent → warning `scène inconnue` (AC-23), abort (scène courante conservée).
3. `resolved = resolveTransition(transition, entering.transition)` (AC-19).
4. `next = mountScene(scene)` ; `null` (config invalide) → abort (l'ancienne reste).
5. `applyVisibility(currentLevel)` sur `next` — le niveau courant est ré-appliqué (AC-34).
6. `m = resolveDotgridMode(entering.dotgridMode)` ; `m === null` → masque `#bg-layer` (pas de `setMode`) ; sinon `grid.setMode(m)` + affiche `#bg-layer` (sauf niveau courant `hidden`). (AC-22, AC-28)
7. Transition (AC-20, AC-21, AC-38) :
   - `cut` → `current.destroy()` immédiat, `next` opacité 1.
   - `crossfade` → `next.root` opacité 0 ; reflow ; `next.root.style.transition = `opacity ${duration}ms ${toCssEasing(easing)}`` ;
     `next` → 1, `current.root` → 0 ; fin via `transitionend` (`{ once:true }` sur `next.root`)
     **ou** timeout `duration` + marge (filet) — le premier déclenché annule l'autre → `current.destroy()`.
8. `current = next`.

**Application de la visibilité (`overlay:visibility-change` → `applyVisibility(level)`)**
1. Pour chaque `[data-layer]` de la scène courante : `el.style.display = isLayerVisible(visibilityByName[name], level) ? '' : 'none'` (AC-30).
2. `#bg-layer` visible ⟺ `level !== 'hidden'` **et** `currentDotgridMode !== null`.
3. `level === 'hidden'` → `body.style.background = 'transparent'` (AC-32) ; sinon `body.style.background = ''` (AC-33).

### Cas d'erreur

| Cas | Action |
|---|---|
| `scene-change` vers `scene` absent du registry | warning `[overlay] scene-change : scène inconnue — <id>`, abort (scène courante conservée) |
| `mountScene` config `!ok` (`validateSceneConfig`) | logge chaque `error`, retourne `null`, swap annulé |
| Couche en config sans `[data-layer]` dans le template | warning `[overlay] mount : couche absente du template — <name>`, couche ignorée, montage poursuivi |
| `ComponentMount.component` inconnu du registry | warning `[overlay] mount : composant inconnu — <nom>`, composant ignoré, montage poursuivi |
| Override `transition` invalide | déjà neutralisé en amont par `reduceMessage` (S2) ; `resolveTransition` re-valide par sécurité et ignore les champs fautifs |

### Edge cases

- **`scene-change` vers la scène courante** : `reduceMessage` filtre en amont (no-op, S2 AC-22) → aucun
  event émis. Garde défensive runtime : si `scene === current.id` → abort.
- **`visibility-change` vers le niveau courant** : filtré en amont (S2). `applyVisibility` est idempotent.
- **Double `scene-change` rapproché** (avant la fin d'un crossfade) : si une transition est en cours,
  la finaliser **instantanément** (`current.destroy()` sans attendre) avant de démarrer la nouvelle.
  Garantit `#scene-root` à une seule scène en régime stable (AC-24) — pas d'accumulation.
- **Scène initiale non implémentée** (`STATIC_FALLBACK.currentScene` hors registry S3) : montage initial
  retourne `null` → warning + repli sur `'brb'` (scène de référence toujours présente). Si `'brb'` est
  lui aussi absent → `#scene-root` vide + warning (ne doit pas survenir : `brb` est de référence).

## Contrat d'événements

Le runtime S3 **consomme** les événements produits par `store.js` (définis et garantis en S2). Il
n'en émet aucun nouveau.

| Événement | `detail` | Consommé par |
|---|---|---|
| `overlay:scene-change` | `{ scene: SceneId, transition?: Partial<SceneTransition> }` | `scene-runtime.js` → swap + transition |
| `overlay:visibility-change` | `{ level: VisibilityLevel }` | `scene-runtime.js` → application visibilité |
| `overlay:morph` | `MorphTriggerData` | **non câblé en S3** (séquencé couche 3) |

## Non-fonctionnel

**Performance** — Une seule instance `DotGridAnimated` (un seul `requestAnimationFrame`) sur tout le
cycle de vie ; aucune scène ne crée de boucle d'animation. Pendant un `crossfade`, deux conteneurs de
scène coexistent **uniquement** le temps de la transition (`duration` ms, borné) ; un enchaînement
rapide finalise la transition en cours avant d'en démarrer une nouvelle (§Edge cases) → jamais plus de
2 scènes dans `#scene-root`. Cible OBS : 1920×1080.

**Observabilité** — Toute dégradation produit un `console.warn` préfixé `[overlay] …` (config invalide,
scène inconnue, couche/composant manquant). Aucune erreur silencieuse.

**Accessibilité** — N/A : Browser Source non interactive (`pointer-events: none`, aucune saisie, pas de
lecteur d'écran). Hors périmètre par nature du support OBS.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `index.html` | **créer** | Page unique : `#bg-layer`, `#scene-root`, `<template data-scene>` × 3, charge `scene-runtime.js` |
| `scene-runtime.js` | **créer** | Orchestrateur DOM : montage initial, swap + transition, visibilité. Écoute les 2 events. Importe registries + helpers purs |
| `scene-resolve.js` | **créer** | Helpers purs : `resolveTransition`, `isLayerVisible`, `resolveDotgridMode`, `toCssEasing`. Zéro DOM/réseau/temps |
| `scene-resolve.test.js` | **créer** | `bun test` des helpers purs (cascade transition, easing CSS, visibilité, dotgrid) |
| `component-registry.js` | **créer** | Map `ComponentName` → factory (5 composants) |
| `scenes/registry.js` | **créer** | `SCENE_CONFIGS` (`SceneId` → `SceneConfig`) + `SCENE_WIRES` (`SceneId` → `wire`) pour les 3 scènes |
| `scenes/discussion.wire.js` | **créer** | Câblage composants `discussion` → store (AD-6) |
| `scenes/brb.wire.js` | **créer** | Câblage composants `brb` → store (AD-6) |
| `scenes/codage.wire.js` | **créer** | Câblage composants `codage` → store (AD-6) |
| `components/DotGridAnimated.js` | modifier | Exporter `GRID_MODES` (clés de `MODE_PARAMS`) pour `resolveDotgridMode` (source unique — DRY) |
| `components/index.js` | modifier | `AlertBanner` expose `destroy()` (`clearTimeout` du `hideTimer`) — cleanup au démontage (AC-39) |
| `types.js` | modifier | Ajouter `ComponentInstance`, `MountedScene`, `SceneWire` |

> Cross-check avant « done » :
> - [ ] Chaque AC → implémenté et vérifié (`bun test` pour les purs, review/visuel OBS sinon)
> - [ ] `scene-resolve.js` ne contient aucun accès DOM / réseau / temps (logique pure, AD-1)
> - [ ] `components/index.js` n'importe pas `store.js` (AD-6)
> - [ ] `overlay:morph` n'est câblé nulle part dans le runtime (AD-7)
> - [ ] Une seule instance `DotGridAnimated` sur tout le cycle de vie de la page (AC-02)
> - [ ] `crossfade` utilise `toCssEasing` (jamais le jeton brut) — easing CSS valide (AC-37/38)
> - [ ] `AlertBanner.destroy()` implémenté + appelé au démontage (AC-39)
> - [ ] `grid.setMode` jamais appelé avec `null` (AC-22)
> - [ ] `bun test` vert : `scene-resolve.test.js`

## Lacunes identifiées

> À remplir dès qu'une lacune est découverte pendant l'implémentation.
> Format : `[ ] LAC-01 — description` + owner approval si déféré à une session future.

Aucune ouverte. Review intégrée (passe du 2026-06-08) : gaps [1] easing→CSS (`toCssEasing`),
[2] cleanup `AlertBanner`, [3] `setMode(null)`, [4] section Non-fonctionnel, [5] position de montage,
[6] typage `unknown`, [7] AC repli scène initiale, [8] conteneurs sans fond opaque, [9] garde
double-fire crossfade — tous corrigés. 41 AC. Spec prête pour implémentation.
