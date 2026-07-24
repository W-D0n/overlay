---
feature: background-reactive-events
created: 2026-07-24
status: validated
---

# Spec : background-reactive-events — réactions d'événements en mode fond autonome

## Contexte

`DotGridAnimated.trigger(alert)` implémente déjà 4 réactions visuelles (`follow`/`sub`/`raid`/`bits`)
+ un minuteur `ambient` interne (`docs/specs/dotgrid-event-triggers.md`, livré 2026-07-10). Mais ce
`trigger()` était câblé par `scene-runtime.js` observant `store.js` (`state.latestAlert`). Le mode
**background-only** (`docs/specs/background-standalone.md`) n'a ni `scene-runtime`, ni `store`, ni
`relay/` : `background.html` fait seulement `mount.apply(current)` depuis le serveur d'état. La
réaction existe donc sur le composant, mais **rien ne l'appelle** dans le flux live actuel.

Le sous-système `relay/` (canal `/emit` générique) est en cours d'archivage — ① ne peut pas s'y
appuyer. Cette spec amène les événements jusqu'à `background.html` par le seul process qui survit et
tourne en live : `dev/background-state-server.js`.

Décisions owner (2026-07-24, AskUserQuestion) :
- **Source d'événements** — canal dans `background-state-server` : `POST /event` → diffusion
  `WS /event-ws`. Le tuner déclenche via des boutons de test. Une intégration Twitch EventSub postera
  sur `/event` plus tard.
- **Portée des réactions** — overlay partagé + natif si présent : une couche de réaction commune se
  dessine par-dessus n'importe quel effet (les 12 presets réagissent) ; si l'effet actif expose
  `trigger()` (DotGrid), sa réaction native prend le dessus et l'overlay ne double pas.

## Périmètre

**Inclus :**
- `dev/background-state-server.js` : `POST /event` (valide le corps, 400 sinon) → diffuse l'événement
  sur `WS /event-ws`. **Aucune écriture disque, aucun `keyed-lock`** (l'événement est éphémère).
- `dev/background-event-format.js` : `validateBackgroundEvent(body)` pur → `{ ok, errors }`, accepte
  uniquement les 4 types. Testé.
- `components/ReactionOverlay.js` : composant partagé `{ el, trigger(event), destroy() }`. Canvas
  transparent plein cadre, `pointer-events: none`, 4 réactions en or Atelier. Le `requestAnimationFrame`
  **démarre au premier trigger et s'arrête quand plus aucune réaction n'est active** (idle = zéro coût).
- `background-reactions.js` : `createReactionCoordinator({ mount, overlay })` → `handle(event)`.
  Route vers la réaction native si l'effet monté l'expose, sinon vers l'overlay. Partagé par
  `background.html` et le tuner (aucune duplication du routage).
- `background-mount.js` : méthode `react(event)` — appelle `instance.trigger?.(event)` et **retourne**
  `true` si l'effet monté possède `trigger`, `false` sinon (le coordinateur décide de l'overlay).
- `background.html` : `#reaction-layer` monté au-dessus de `#bg-layer` ; abonnement `WS /event-ws`
  relayé vers `coordinator.handle(event)`.
- `dev/background-state-client.js` : `sendEvent(type)` (`POST /event`) + abonnement `/event-ws`.
- Tuner (`dev/background-tuner.html` + `dev/background-tuner-runtime.js` + preview) : section
  « Tester une réaction » avec 4 boutons → `client.sendEvent(type)`. L'appel passe par le serveur,
  donc l'URL OBS réelle réagit aussi (vérification live).

**Exclu (différé) :**
- Intégration Twitch EventSub réelle (le producteur qui postera sur `/event`).
- Déclenchement `ambient` pour les effets autres que DotGrid — l'overlay est **event-only** ; le
  minuteur `ambient` reste interne à `DotGridAnimated` (déjà livré, inchangé).
- Réactions natives sur mesure sur les 10 autres effets de fond — zero preemptive code ; ils passent
  par l'overlay partagé tant qu'un besoin concret d'une réaction native spécifique n'est pas exprimé.
- Superposition de plusieurs réactions overlay simultanées — une nouvelle réaction remplace l'active
  (cohérent avec DotGrid, AC-06 de `dotgrid-event-triggers.md`).
- Persistance/rejeu des événements manqués pendant une coupure (éphémères par nature).

## Architecture — flux

```text
tuner (boutons test) ─POST /event─► background-state-server ─WS /event-ws─► background.html + aperçu tuner
                                    (validation, pas d'écriture)                    │
                                                          coordinator.handle(event) │
                                                            mount.react(event) ?    ▼
                                                              true  → réaction native (DotGrid)
                                                              false → overlay.trigger(event)
```

## Format de données

Corps de `POST /event` — réutilise la forme `AlertEvent` (`types.js`), seul `type` est requis :

```json
{ "type": "sub", "username": "xyz", "amount": 3, "timestamp": 1721800000000 }
```

- `type` : `'follow' | 'sub' | 'raid' | 'bits'`. Toute autre valeur → 400.
- `username`, `amount`, `timestamp` : optionnels, transmis tels quels sur le WS, **non utilisés** par
  les réactions visuelles (seul `type` pilote le rendu, comme dans `dotgrid-event-triggers.md`).
- Pas de déduplication : chaque `POST /event` réussi produit exactement une diffusion (l'événement est
  une commande directe — bouton ou EventSub — pas un état sondé).
- `background-state.json` n'est **jamais** touché par cette route.

## Types JSDoc

Aucun nouveau typedef. `ComponentInstance.trigger` et `AlertEvent {type, username, timestamp, amount?}`
existent déjà (`types.js`, `dotgrid-event-triggers.md`). `background-mount.react` réutilise cette
signature.

## Comportements — réactions de l'overlay

L'overlay dessine ses propres réactions en or Atelier (`--color-gold` = `#C8B97A`), indépendantes de
l'effet de fond. Modèle : une seule réaction active à la fois (`active: { type, startTime, duration }
| null`) lue dans la boucle ; terminée quand `(now - startTime) >= duration` → `active = null` et arrêt
du RAF si plus rien n'est actif.

1. **`follow`** — anneau doré partant d'un coin aléatoire, rayon croissant de `0` à la diagonale du
   cadre sur `duration = 1800ms`, opacité décroissante ; épaisseur de trait décroissante.
2. **`sub`** — voile doré uniforme plein cadre suivant `sin(progress · π)` (monte puis redescend) sur
   `duration = 1600ms` — pulsation globale, sans position.
3. **`raid`** — bande verticale dorée de largeur `15% de cssW`, centre progressant de `-largeur` à
   `cssW + largeur` sur `duration = 2600ms`, dégradée sur ses bords.
4. **`bits`** — 18 à 32 flashs dorés à positions aléatoires dans le cadre, chacun `sin(progress · π)`
   indépendant sur `duration = 1400ms`.

### Cas d'erreur / edge cases

- `POST /event` avec `type` invalide ou corps non-objet → **400** avec la liste d'erreurs, aucune
  diffusion WS (anti-pattern « masking failures » : pas de repli silencieux).
- `overlay.trigger(event)` avec `event.type` hors des 4 valeurs → no-op silencieux (garde interne),
  jamais d'exception — cohérent avec `resolveMode`/`resolveTransition`.
- `coordinator.handle` alors qu'aucun effet n'est monté (`mount.react` retourne `false`, pas de
  `instance`) → l'overlay joue la réaction seul. Aucune erreur.
- Nouvelle réaction pendant une réaction active de l'overlay → remplace immédiatement (pas de file,
  pas de fondu).
- Switch d'effet pendant une réaction overlay → la réaction se termine par-dessus le nouveau fond
  (overlay indépendant du montage ; cas rare, assumé).
- Resize pendant une réaction overlay → le canvas est redimensionné, la géométrie recalculée à la
  volée depuis les dimensions courantes (pas d'indices figés côté overlay).
- `background.html` chargé avant le serveur, ou coupure : reconnexion WS avec backoff (mécanisme
  existant) ; les événements émis pendant la coupure sont perdus sans erreur (éphémères).
- `destroy()` / démontage → arrêt du RAF, retrait du canvas, aucun callback après destruction.

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `overlay.trigger({type:'follow'})` produit un anneau depuis un coin, ~1800ms | test helper + visuel |
| AC-02 | `overlay.trigger({type:'sub'})` produit un voile uniforme `sin(π)`, ~1600ms | test helper + visuel |
| AC-03 | `overlay.trigger({type:'raid'})` produit une bande verticale balayant gauche→droite, ~2600ms | test helper + visuel |
| AC-04 | `overlay.trigger({type:'bits'})` produit 18–32 flashs indépendants, ~1400ms | test helper + visuel |
| AC-05 | `overlay.trigger({type:'inconnu'})` → no-op, aucune réaction, aucune erreur | test |
| AC-06 | `validateBackgroundEvent` : 4 types valides → ok ; type absent/inconnu, corps non-objet → error listé | test |
| AC-07 | `POST /event` corps invalide → 400, **aucune** diffusion `/event-ws` | test HTTP |
| AC-08 | `POST /event` corps valide → exactement **une** diffusion `/event-ws` portant l'événement | test HTTP |
| AC-09 | `POST /event` ne modifie pas `background-state.json` (comparaison avant/après) | test HTTP |
| AC-10 | `mount.react(event)` retourne `true` si l'effet monté expose `trigger`, `false` sinon | test |
| AC-11 | `coordinator.handle` : `true` → n'appelle pas l'overlay ; `false` → appelle `overlay.trigger` | test |
| AC-12 | `overlay` : RAF inactif tant qu'aucune réaction n'est active ; démarré au trigger, arrêté à la fin | test (compteur de frames) |
| AC-13 | `overlay.destroy()` arrête le RAF (aucun callback après destruction) et retire le canvas | test |

> Chaque AC est vérifiable de façon autonome.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `dev/background-event-format.js` | créer | `validateBackgroundEvent(body)` pur |
| `dev/background-event-format.test.js` | créer | AC-06 |
| `dev/background-state-server.js` | modifier | `POST /event` + `WS /event-ws`, sans écriture disque |
| `dev/background-state-server.test.js` | modifier | AC-07, AC-08, AC-09 |
| `components/ReactionOverlay.js` | créer | overlay `{ el, trigger, destroy }`, 4 réactions, RAF paresseux |
| `components/ReactionOverlay.test.js` | créer | AC-01→AC-05 (helpers purs), AC-12, AC-13 |
| `background-mount.js` | modifier | `react(event)` → `boolean` |
| `background-mount.test.js` | modifier | AC-10 |
| `background-reactions.js` | créer | `createReactionCoordinator({ mount, overlay })` |
| `background-reactions.test.js` | créer | AC-11 |
| `background.html` | modifier | `#reaction-layer`, abonnement `/event-ws` → coordinator |
| `dev/background-state-client.js` | modifier | `sendEvent(type)` + abonnement `/event-ws` |
| `dev/background-tuner.html` | modifier | section « Tester une réaction » (4 boutons) |
| `dev/background-tuner-runtime.js` | modifier | câble les boutons → `client.sendEvent` |

> Cross-check avant « done » : chaque AC implémenté et vérifiable ; chaque fichier listé modifié ;
> `bun test` vert ; vérification live bout en bout (bouton test → réaction sur `background.html` en
> Browser Source, DotGrid natif ET un effet non-DotGrid via overlay).

## Tests

Logique pure isolée du DOM/réseau partout où c'est possible (mêmes conventions que
`dotgrid-event-triggers.md` : géométrie et opacité de réaction extraites en helpers testables sans
canvas). Le serveur est vérifié par HTTP réel (import invalide → 400 sans diffusion, valide → une
diffusion, état disque inchangé), comme `background-state-server.test.js` existant. Le coordinateur et
`mount.react` sont testés sans navigateur avec un faux `instance`/`overlay`.

## Hors scope

- Intégration Twitch EventSub (`/event` restera le point d'entrée générique, comme `/emit` l'était).
- Réactions `ambient` hors DotGrid, réactions natives sur mesure sur les autres effets.
- Rejeu des événements manqués pendant une coupure.
