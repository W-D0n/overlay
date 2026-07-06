---
feature: scene-transition-library
created: 2026-07-06
updated: 2026-07-06
status: draft
---

# Spec : scene-transition-library (Track A de l'« Épopée »)

## Contexte

`docs/specs/scene-runtime-engine.md` (S3) a volontairement limité `TransitionType` à `crossfade`/`cut`
— ligne 90 : « Nouvelles valeurs de `TransitionType` au-delà de `crossfade`/`cut` → besoin concret
futur ». Ce besoin est maintenant exprimé par l'owner (2026-07-06) : il veut plusieurs transitions
différentes disponibles aux changements de scène — `slide`, `wipe`, et `morph` (qui anime enfin le
fond DotGrid via `morphTo()`, stub vide depuis sa création, jamais appelé).

Cette spec étend `scene-runtime-engine.md`, ne le remplace pas — `resolveTransition`/`crossfade`
existants restent inchangés pour `crossfade`/`cut`.

## Périmètre

**Inclus :**
- `TransitionType` étendu : `'crossfade' | 'cut' | 'slide' | 'wipe' | 'morph'`.
- `slide` : la scène sortante glisse hors champ (translateX/Y) pendant que l'entrante glisse depuis
  le bord opposé. **Direction configurable** (`direction`, owner 2026-07-06 — tuning dès la v1, pas
  différé) : `'left' | 'right' | 'up' | 'down'`, défaut `'right'` (entrante depuis la droite).
- `wipe` : révélation de la scène entrante via `clip-path` animé. **Configurable dès la v1** :
  `direction` (même 4 valeurs que `slide`, défaut `'right'` — sens du balayage) et `color` (couleur
  du bord de balayage, référence token comme le reste du projet — ex. `var(--color-gold)`, défaut
  `var(--color-gold)`, cohérent avec la direction artistique Atelier).
- `morph` : le fond DotGrid partagé (`#bg-layer`, un seul par process, pas par scène) transite
  visuellement entre les paramètres du mode sortant et ceux du mode entrant via `morphTo()`, au lieu
  du saut instantané actuel de `setMode()`. Le contenu de premier plan (scènes) suit un `crossfade`
  standard en parallèle — `morph` ne change QUE le comportement du fond, pas celui du contenu.
  `duration`/`easing` (déjà existants sur `SceneTransition`) pilotent la vitesse d'interpolation —
  pas de champ supplémentaire nécessaire, la vitesse EST le seul paramètre de tuning pertinent ici.
- Si `morph` est demandé mais qu'aucune des deux scènes (sortante/entrante) n'a de `dotgridMode`, ou
  que les deux ont le MÊME mode : dégrade proprement en `crossfade` simple (rien à animer côté fond).

**Exclu :**
- Transitions combinables (ex. slide + morph simultanés) — une seule transition à la fois, comme
  aujourd'hui.
- UI panneau pour choisir la transition ET ses options (`direction`/`color`) par scène — Track A
  session 4 (après l'implémentation), pas cette session. Les champs existent dès A2/A3 dans le
  format de données ; l'UI pour les éditer visuellement suit en A4.

## Acceptance Criteria — Session A1 (cette session : spec uniquement)

Aucun code cette session — spec à valider avant A2 (implémentation `slide`/`wipe`) et A3
(implémentation `morph`, la plus incertaine techniquement).

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `resolveTransition` accepte les 5 valeurs de `TransitionType` (rejette toute autre valeur, comme aujourd'hui) | test |
| AC-02 | `slide` : scène entrante glisse depuis `direction` (défaut `'right'`) vers sa position finale, sortante part vers la direction opposée, sur `duration`ms avec `easing`, puis sortante démontée (même filet `transitionend`/timeout que `crossfade`) | visuel OBS |
| AC-03 | `wipe` : scène entrante révélée par `clip-path` animé dans le sens de `direction` (défaut `'right'`), bord de balayage teinté par `color` (défaut `var(--color-gold)`), sortante reste statique dessous puis démontée | visuel OBS |
| AC-04 | `morph` avec deux modes DotGrid différents : le fond transite ses paramètres visuels sur `duration`ms (pas de saut brutal), le contenu de premier plan fait un `crossfade` standard en parallèle | visuel OBS |
| AC-05 | `morph` avec modes identiques ou l'un/les deux `null` : dégrade en `crossfade` simple, aucune erreur | test + visuel |
| AC-06 | Chaque nouveau type respecte le filet `transitionend` OU timeout déjà en place (`crossfade()`, scene-runtime.js) — jamais de scène sortante qui reste montée indéfiniment si l'événement CSS ne se déclenche pas | test/review |
| AC-07 | `direction` hors des 4 valeurs valides (`slide`/`wipe`) → repli sur `'right'`, jamais une valeur brute injectée en CSS | test |
| AC-08 | `color` absent/invalide (`wipe`) → repli sur `var(--color-gold)` | test |

## Types JSDoc

```js
// types.js — TransitionType étendu (remplace la ligne 117 actuelle)
/**
 * @typedef {'crossfade'|'cut'|'slide'|'wipe'|'morph'} TransitionType
 */

/**
 * @typedef {'left'|'right'|'up'|'down'} TransitionDirection
 */

// types.js — SceneTransition étendu (remplace la définition actuelle, lignes 194-201)
/**
 * @typedef {Object} SceneTransition
 * @property {TransitionType} type
 * @property {number} duration - Durée en ms (ignoré si type === 'cut')
 * @property {TransitionEasing} easing - (ignoré si type === 'cut')
 * @property {TransitionDirection} [direction] - Sens (slide/wipe uniquement), défaut 'right'
 * @property {string} [color] - Couleur du bord de balayage (wipe uniquement), référence token CSS
 *   (ex. `var(--color-gold)`), défaut `var(--color-gold)`
 */
```

## Format de données

```js
// Exemple : scenes/data/discussion.scene.json — transition slide (direction explicite)
{
  "id": "discussion",
  "transition": { "type": "slide", "duration": 500, "easing": "easeInOut", "direction": "left" },
  "...": "..."
}

// Exemple : transition wipe (direction + couleur explicites)
{
  "id": "brb",
  "transition": { "type": "wipe", "duration": 600, "easing": "easeInOut", "direction": "right", "color": "var(--color-gold)" },
  "...": "..."
}

// Exemple : transition morph (dotgridMode différent de la scène précédente) — pas de direction/color
{
  "id": "codage",
  "dotgridMode": "codage",
  "transition": { "type": "morph", "duration": 800, "easing": "easeInOut" },
  "...": "..."
}
```

## Comportements

### Cas nominaux
1. `slide` — `direction: 'right'` (défaut) : l'entrante vient de la droite, la sortante part vers la
   gauche. Les 4 valeurs (`left`/`right`/`up`/`down`) inversent l'axe (`translateX` pour
   gauche/droite, `translateY` pour haut/bas) et le sens de départ de la sortante (toujours opposé
   à l'entrante).
2. `wipe` — `direction: 'right'` (défaut) : balayage gauche → droite (`clip-path: inset(0 X% 0 0)`
   animé de `100%` à `0%`). `left`/`up`/`down` adaptent l'axe et le bord du `clip-path` inversé en
   conséquence. `color` teinte un liseré fin (`box-shadow` ou pseudo-élément) suivant le bord de
   révélation pendant l'animation.
3. `morph` — le fond DotGrid interpole ses paramètres (`freqX`, `freqY`, `freqT`, `amplitude`,
   `MODE_PARAMS`) du mode sortant vers le mode entrant sur `duration`ms, au lieu du saut instantané
   de `setMode()`. Implémentation concentrée dans `morphTo()` (actuellement un stub vide) — voir
   session A3, le point technique le plus incertain de ce chantier (interpolation à implémenter dans
   la boucle de rendu de `DotGridAnimated.js`, qui lit aujourd'hui `MODE_PARAMS[currentMode]`
   directement à chaque frame).

### Cas d'erreur
- `type` hors des 5 valeurs valides → rejeté par `resolveTransition` comme aujourd'hui (repli sur la
  priorité inférieure, jamais une valeur invalide appliquée).
- `direction` hors des 4 valeurs valides (`slide`/`wipe`) → repli sur `'right'` (AC-07).
- `color` absent ou pas une chaîne (`wipe`) → repli sur `var(--color-gold)` (AC-08). Pas de
  validation de format au-delà de "c'est une chaîne" — cohérent avec le reste du projet (les champs
  couleur des composants, ex. `StatBlock.valueColor`, acceptent déjà token ou valeur CSS brute sans
  validation stricte de forme).
- `morph` demandé sans changement de mode DotGrid → dégradation silencieuse en `crossfade` (pas une
  erreur, un cas normal, voir AC-05).

### Edge cases
- Deux transitions déclenchées coup sur coup (déjà géré par `finalizePending`/`crossfade`
  aujourd'hui, réutilisé tel quel pour les 3 nouveaux types) — la transition en cours est finalisée
  avant d'en démarrer une nouvelle.
- `morph` où SEULE la scène sortante a un `dotgridMode` (l'entrante est `null`) : le fond doit
  s'estomper (cohérent avec `applyGlobalVisibility`, qui masque déjà `#bg-layer` quand
  `currentDotgridMode === null`) plutôt que de "morpher vers rien" — comportement à préciser en A3.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | `TransitionType` étendu (5 valeurs), nouveau `TransitionDirection`, `SceneTransition` étendu (`direction`, `color`) |
| `scene-resolve.js` | modifier | `TRANSITION_TYPES` étendu ; validation/repli de `direction` (AC-07) et `color` (AC-08) dans `resolveTransition` |
| `scene-resolve.test.js` | modifier | tests AC-01, AC-05, AC-07, AC-08 (pure — dégradation `morph` sans changement de mode résolue plus haut dans `scene-runtime.js`, pas ici) |
| `scene-runtime.js` | modifier | `slide`/`wipe`/`morph` dans la logique de transition (AC-02 à AC-06) — session A2 (`slide`/`wipe`) puis A3 (`morph`) |
| `components/DotGridAnimated.js` | modifier | implémente enfin `morphTo()` (actuellement stub) — session A3 |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — Comportement exact de `morph` quand un seul côté (entrant/sortant) a un
      `dotgridMode` non-null : à préciser en session A3 (candidat : traiter comme un fade
      d'opacité du fond en parallèle du morph des paramètres, plutôt qu'un cas d'erreur).
