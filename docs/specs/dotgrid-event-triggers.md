---
feature: dotgrid-event-triggers
created: 2026-07-10
updated: 2026-07-10
status: draft
---

# Spec : dotgrid-event-triggers (Couche 4 du DotGrid — 3 sessions atomiques)

## Contexte

Le cadrage DotGrid initial de juin 2026 (désormais conservé par l'historique Git) posait une
architecture à 4 couches pour
`DotGridAnimated.js`. Couches 1+2 (base aléatoire + bruit Simplex ambiant) livrées en S1. Couche 3
(morphisme de forme, bitmap/SDF/IA) est **obsolète** : Track B (`docs/specs/background-effects-library.md`,
AD-B1) a résolu ce besoin autrement et mieux — `ShapeMorphBackground` est un composant de fond
séparé (interpolation radiale de silhouette), `#bg-layer` polymorphe permet de le substituer au
DotGrid par scène. Réintroduire du morph-vers-forme *dans* `DotGridAnimated.js` dupliquerait cette
architecture. Seule la **Couche 4** (réactions visuelles à des événements stream discrets) reste un
gap réel : `trigger(eventType)` est un stub vide depuis sa création.

Décidé avec l'owner (2026-07-10) :
- Réagir aux 4 alertes déjà existantes (`alert.follow/sub/raid/bits`, déjà câblées à `AlertBanner`
  dans chaque `*.wire.js`) — pas un nouveau canal d'événements.
- Garder le déclenchement `ambient` automatique du handoff de juin (respiration périodique).
- Câblage **impératif**, pas via le mécanisme déclaratif `ComponentMount.trigger` — ce mécanisme
  existe (`scene-runtime.js`, S8) mais n'est éprouvé par aucune scène en production (voir
  `docs/inbox.md` §Migration `jeu`, décision de ne pas le roder sur une feature secondaire). Cohérent
  avec le câblage actuel d'`AlertBanner`, qui est lui aussi impératif.

## Périmètre

**Inclus :**
- `DotGridAnimated.trigger(alert)` implémenté : reçoit un `AlertEvent` (même forme que
  `state.latestAlert`, pas une simple chaîne — changement de signature assumé, le stub actuel n'a
  aucun appelant).
- 4 comportements visuels, un par `AlertEvent.type` (voir §Comportements) — un seul actif à la fois
  (un nouveau trigger remplace l'ancien, pas de superposition : les alertes sont rares, pas de besoin
  concret de gérer le chevauchement).
- Déclenchement `ambient` : toutes les 45–90s (aléatoire), pioche l'un des 4 comportements ci-dessus
  au hasard et l'exécute — **pas** de 5ᵉ comportement distinct (réutilise l'existant, pas de nouveaux
  algorithmes `breath`/`ripple`/`constellation` du handoff de juin, jamais redemandés depuis).
- `scene-runtime.js` observe `state.latestAlert` en interne (`applyBackgroundReactions`, abonnée via
  `onStateChange`, même mécanisme que `applyBindings`/S8) et relaie vers
  `currentBackground?.trigger?.(state.latestAlert)` si le composant de fond actif expose `trigger`
  (optionnel, même pattern que `morphTo`, Track B). **Révision en session 3** (trouvé pendant
  l'implémentation) : `scene-runtime.js` importe déjà `onStateChange` de `store.js` (pas
  store-agnostic comme supposé en session 1) — observer l'alerte directement évite tout câblage des
  9 `*.wire.js` et la dépendance circulaire que ça aurait introduite (`scene-runtime.js →
  scenes/registry.js → *.wire.js → scene-runtime.js`). Dédoublonnage par `timestamp`, une seule fois
  ici plutôt que dupliqué dans 9 fichiers.
- `ComponentInstance.trigger` formalisé dans `types.js` (optionnel, comme `morphTo`).

**Exclu :**
- Couche 3 (morphisme bitmap/SDF/IA) — obsolète, voir §Contexte.
- Le mécanisme déclaratif `ComponentMount.trigger` — non utilisé ici, voir §Contexte.
- `trigger()` sur les 10 autres effets de fond (Rain, Bubble, etc.) — zero preemptive code, seul
  `DotGridBackground` l'implémente ; un autre effet ne le reçoit que si demandé concrètement (dégrade
  silencieusement en no-op via `?.`, même pattern que `morphTo` absent).
- Superposition de plusieurs triggers actifs simultanément — pas de besoin concret exprimé.

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `trigger({type:'follow',...})` déclenche une onde expansive depuis un coin aléatoire, ~2000ms | visuel OBS |
| AC-02 | `trigger({type:'sub',...})` déclenche une pulsation globale d'amplitude, ~2000ms | visuel OBS |
| AC-03 | `trigger({type:'raid',...})` déclenche un balayage de bande verticale gauche→droite, ~3000ms | visuel OBS |
| AC-04 | `trigger({type:'bits',...})` déclenche un scatter de 20-40 points qui flashent indépendamment, ~1500ms | visuel OBS |
| AC-05 | `trigger({type:'inconnu'})` → no-op silencieux, aucune erreur | test |
| AC-06 | Un nouveau `trigger()` pendant une réaction active la remplace immédiatement (jamais de superposition) | test |
| AC-07 | Le minuteur `ambient` se déclenche entre 45000-90000ms, pioche aléatoirement l'un des 4 types, se réarme après chaque déclenchement (auto ou manuel) | test (bornes de l'intervalle) |
| AC-08 | `destroy()` arrête le minuteur `ambient` (pas de callback après démontage) | test |
| AC-09 | `applyBackgroundReactions` ne fait rien si le composant de fond actif n'expose pas `trigger` (ex: `RainBackground`) — aucune erreur | test/review |
| AC-10 | `state.latestAlert` est relayé au fond actif une seule fois par alerte (dédoublonnage par `timestamp`), quelle que soit la scène montée | review + visuel |

> Règle : chaque AC est vérifiable de façon autonome.

## Types JSDoc

```js
// types.js — ComponentInstance.trigger formalisé (nouveau champ optionnel, comme morphTo)
/**
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el
 * @property {(data: unknown) => void} [update]
 * @property {(alert: unknown) => void} [show]
 * @property {(options: unknown, duration: number, easing: TransitionEasing) => void} [morphTo]
 * @property {(payload: unknown) => void} [trigger] - Réaction impérative à un événement discret
 *   (ex: alerte stream). Optionnel : un composant sans `trigger` ignore silencieusement l'appel
 *   (`applyBackgroundReactions`, `scene-runtime.js`), même pattern que `morphTo` absent (AD-B3).
 */
```

Aucun nouveau typedef pour `AlertEvent` — déjà défini (`types.js`, `{type, username, timestamp, amount?}`).

## Format de données

`trigger()` ne consomme pas de config JSON — c'est un appel impératif déclenché par le flux
`state.latestAlert`, pas un champ de `SceneConfig`. Aucun fichier `scenes/data/*.scene.json` ne
change.

```js
// Flux interne (scene-runtime.js) : state.latestAlert relayé automatiquement, aucun appel manuel
// { type: 'sub', username: 'xyz', timestamp: 1234567890, amount: 3 } → currentBackground.trigger(...)
```

## Comportements

### Cas nominaux

Modèle interne : une seule réaction active à la fois (`activeReaction: { type, startTime, duration,
params } | null`), lue dans `tick()` en plus de C1+C2, ajoute un delta d'opacité `c3` par point.
Terminée quand `(timestamp - startTime) >= duration` → `activeReaction = null` (retour à C1+C2 pur).

1. **`follow`** — coin aléatoire choisi parmi les 4 coins de l'écran au déclenchement. Rayon d'onde
   croissant linéairement de `0` à la diagonale de l'écran sur `duration = 2000ms`. Chaque point reçoit
   un boost d'opacité proportionnel à sa proximité au front de l'onde (bande de ~80px d'épaisseur
   autour du rayon courant, boost maximal au centre de la bande, nul au-delà) — front qui balaie
   l'écran depuis le coin, puis s'éteint en sortant du cadre.
2. **`sub`** — boost d'opacité **uniforme** sur tous les points, suivant `sin(progress * π)` (monte
   puis redescend) sur `duration = 2000ms` — pas de position, juste une respiration globale plus
   intense que le bruit ambiant.
3. **`raid`** — bande verticale de largeur `15% de cssW`, centre progressant linéairement de
   `-largeur` à `cssW + largeur` sur `duration = 3000ms`. Points dans la bande (distance horizontale
   au centre de bande < largeur/2) reçoivent un boost d'opacité, dégradé sur les bords de la bande.
4. **`bits`** — au déclenchement, tire 20 à 40 indices de points aléatoires **parmi le `pointCount`
   courant**. Chacun reçoit un flash indépendant (`sin(progress * π)` sur `duration = 1500ms`), les
   autres points ne sont pas affectés.
5. **`ambient`** — minuteur interne (`setTimeout`, réarmé après chaque exécution — manuelle ou
   automatique — avec un nouveau délai aléatoire `45000 + Math.random() * 45000` ms), choisit
   aléatoirement l'un des 4 types ci-dessus et appelle `trigger({ type, ... })` en interne avec des
   champs `username`/`timestamp` factices (non utilisés par les comportements visuels, seul `type`
   compte).

### Cas d'erreur

- `trigger(payload)` avec `payload.type` hors des 4 valeurs valides → no-op silencieux, aucune
  réaction créée, aucune erreur (AC-05) — cohérent avec `resolveMode`/`resolveTransition` (repli
  silencieux sur l'état courant plutôt qu'une exception).
- `applyBackgroundReactions` alors qu'aucune scène n'est montée ou que le fond actif n'expose pas
  `trigger` → no-op (AC-09), même garde `?.()` que `morphTo`.

### Edge cases

- Un `trigger()` reçu pendant une réaction déjà active **remplace** immédiatement l'ancienne (AC-06)
  — pas de file d'attente, pas de fondu entre les deux (transition brute assumée : les alertes sont
  rares, le cas de chevauchement l'est encore plus, pas de besoin concret de le lisser).
- Resize pendant une réaction active (`bits` avec indices de points tirés sur l'ancien `pointCount`) :
  `handleResize` reconstruit déjà tous les tableaux de points — la réaction active est abandonnée
  silencieusement (mêmes garanties que l'état C1 aujourd'hui, qui se réinitialise déjà au resize).
- `destroy()` avant l'échéance du minuteur `ambient` → `clearTimeout` (AC-08), pas de callback sur un
  canvas déjà détruit.

## Contrat d'événements

Aucun nouveau `CustomEvent` DOM — le déclenchement passe par une observation directe de
`state.latestAlert` dans `scene-runtime.js` (`onStateChange`), pas par le bus d'événements
`overlay:*` (cohérent avec le choix "câblage impératif" du §Contexte).

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | `ComponentInstance.trigger` formalisé |
| `components/DotGridAnimated.js` | modifier | `trigger(alert)` implémenté (5 comportements), minuteur `ambient`, `destroy()` clear le minuteur |
| `components/DotGridAnimated.test.js` | modifier | AC-05, AC-06, AC-07 (bornes), AC-08 — logique pure extraite où possible |
| `scene-runtime.js` | modifier | `applyBackgroundReactions(state)`, abonnée via `onStateChange` dans `init()` — pas de nouveau fichier wire touché (révision session 3, voir §Comportements) |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque fichier listé → modifié conformément
> - Les 9 wire files → grep confirmant l'appel ajouté partout, pas seulement certains

## Lacunes identifiées

- [x] **LAC-01** — Tranchée en session 3 (2026-07-10) : le câblage prévu via les 9 `*.wire.js`
      (`triggerBackground()` exporté de `scene-runtime.js`, appelé depuis chaque wire) aurait
      introduit une dépendance circulaire (`scene-runtime.js → scenes/registry.js → *.wire.js →
      scene-runtime.js`). Découverte en implémentant : `scene-runtime.js` importe déjà
      `onStateChange` de `store.js` (S8, pour `applyBindings`) — pas store-agnostic comme supposé en
      session 1. `applyBackgroundReactions(state)` observe directement `state.latestAlert` via ce
      même mécanisme, aucun fichier wire modifié, dédoublonnage centralisé en un seul endroit au
      lieu de dupliqué dans 9 fichiers.
- [ ] **LAC-02** — Trouvée en `/code-review` (2026-07-10), acceptée telle quelle (owner) : deux
      courses très étroites, fenêtre de quelques dizaines de ms au chargement de la page uniquement
      (avant la première alerte possible, en pratique plusieurs heures plus tard en stream) —
      corriger ajouterait de la complexité pour un cas limite qui ne se produit jamais en usage réel.
      Documentées ici pour un futur refacto si jamais elles se manifestent :
      1. `DotGridAnimated.trigger()` appelé avant le premier `handleResize()` (`pointCount === 0`) →
         `bits`/`follow` produisent une réaction silencieusement invisible (Set d'indices vide /
         rayon toujours nul), pas de crash.
      2. `scene-runtime.js` `applyBackgroundReactions` : une alerte arrivant pendant l'attente
         réseau de `loadDynamicScenes()` (avant que `currentBackground` soit monté) consomme son
         timestamp de dédoublonnage sans déclencher de réaction — perdue définitivement pour le
         fond (`AlertBanner` n'est pas affecté, mécanisme séparé dans les `*.wire.js`).

## Décomposition des 3 sessions

1. **Session 1 — spec** (2026-07-10, faite). Aucun code.
2. **Session 2 — implémentation `DotGridAnimated.trigger()`** (2026-07-10, faite) : les 4
   comportements + `ambient` + tests purs (logique de calcul du delta d'opacité extraite en helpers
   testables sans canvas, même principe que `lerpModeParams`/`degToLUTIndex`). Vérifié visuellement
   par échantillonnage de pixels (navigateur piloté) pour `follow`/`raid`/`bits`.
3. **Session 3 — câblage** (2026-07-10, faite) : `applyBackgroundReactions()` dans
   `scene-runtime.js`, abonnée via `onStateChange` dans `init()` (LAC-01, pas de fichier wire
   touché). Vérification visuelle bout en bout à faire (simulation d'alerte via le relais/`store.js`).
