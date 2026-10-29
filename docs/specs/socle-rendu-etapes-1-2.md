---
created: 2026-10-29
updated: 2026-10-29
---

# Spec — Socle de rendu : contrat d'URL, transport d'état, horloge unique (étapes 1 et 2)

Statut : **étape 1 livrée le 2026-10-29** (render-url, render-transport, `background.html` réduit à l'assemblage) ; étape 2 livrée le 2026-10-29 : horloge (`render-clock.js`), `defineCanvasLayer`, les dix effets canvas migrés (Rain en pilote, puis les cinq effets fautifs, DotGrid, ColorDrops, FloatingSymbols, WaterRipple) et `ReactionOverlay` sur la boucle commune ; GeometricPattern reste hors périmètre (CSS). Boucles propres restantes, hors effets : l'échantillonnage audio (`background-audio.js`, actif seulement avec le micro), les transitions de `background-mount.js` et la mesure de FPS du tuner. Reste à contrôler dans OBS : FPS et ressenti. Emplacement des modules : à plat à la racine, validé (recommandation acceptée). Étapes 1 et 2 du chemin de migration de
`docs/architecture-review.md` §5, décisions D1 à D6 acceptées. Ces deux étapes sont indépendantes du
reste du Studio : elles apportent seules de la stabilité et de la maintenabilité, et posent les deux
briques dont dépendent les couches (étape 4) et la timeline (étape 8).

Vocabulaire : module, interface, seam, adapter, profondeur (`codebase-design`).

## Problème (constats mesurés, `architecture-review.md` F1, F3, A2)

1. **Le contrat d'URL n'a pas de module.** `preset`, `branding`, `transparent` sont lus dans
   `background.html`, `quality` dans `components/canvas-runtime.js` (global `location.search`) et dans
   le tuner, et les URL sont construites dans `background-selection.js`. Un effet dépend donc de
   l'URL de la page : impossible d'avoir deux aperçus de qualités différentes dans une même page.
2. **Le transport d'état est dans la page.** `background.html` embarque la connexion WebSocket, le
   backoff, la resynchronisation et trois canaux séparés. Le rendu dépend du transport, contrairement
   au principe de `zero-install-local-first.md` (« le rendu ne dépend jamais du transport »).
3. **Chaque effet recopie le cycle de vie** : 10 boucles `requestAnimationFrame`, 10 `ResizeObserver`,
   10 gestions du ratio de pixels. Pas de budget commun, pas de temps commun, pas d'isolement d'un effet
   qui lève.
4. **Un défaut visible en découle** (calculé, pas encore observé dans OBS, QA court case 4) : six effets
   calculent leur mouvement avec `timestamp × facteur`. Changer le facteur (réaction audio, curseur)
   déplace tout instantanément, d'autant plus que le live dure (étoiles : 10 px à 10 s, 480 px à 10 min).

## Étape 1 — Contrat d'URL et interface de transport

### 1a. `render-url.js` (racine, logique pure)

```js
parseRenderUrl(search)  // → { presetRef: string | null, branding: 'on' | 'off' | 'only',
                        //     transparent: boolean, quality: 'auto' | 'performance' }
buildRenderUrl({ base, presetRef?, quality?, branding? })  // → string, transparent=1 toujours
```

- Valeur inconnue ou absente → valeur neutre (`'on'`, `false`, `'auto'`), jamais d'exception : une URL de
  Browser Source ancienne doit continuer à s'afficher.
- `background-selection.js` ne construit plus d'URL à la main ; `background.html` n'appelle plus
  `URLSearchParams`.
- `canvasPixelRatio` reçoit la qualité en paramètre. Jusqu'à l'étape 2 son appelant la lit via
  `parseRenderUrl(location.search)` ; après l'étape 2 elle vient du contexte de rendu.
- **Test de contrat** : aller-retour `build → parse` pour toutes les combinaisons ; les URL déjà en
  circulation (`?preset=<id>&transparent=1`, `?preset=<nom>`, `?quality=performance`, `?branding=only`)
  se lisent comme avant (jeu de cas figé dans le test).

### 1b. `render-transport.js` — l'interface côté rendu

```js
createRenderTransport(options) → {
  load(): Promise<StateFile>,                       // lecture complète
  subscribe({ onCurrent, onPresets, onBranding, onEvent, onStatus }): () => void,
}
```

Un seul **seam** : tout ce que `background.html` sait du serveur. Adaptateurs :

| Adaptateur | Rôle | Statut |
|---|---|---|
| `createLocalTransport` | HTTP + les quatre WebSocket actuels, reconnexion avec backoff, resynchronisation à l'ouverture (code déplacé de `background.html`, comportement identique) | Livré à l'étape 1 |
| `createCachedTransport(inner, storage)` | Enveloppe : rend le dernier état connu **avant** la réponse du serveur, puis réconcilie | Livré à l'étape 1, **activé seulement après mesure** (voir ci-dessous) |
| Transport cloud | Voir `zero-install-local-first.md` phase 5 | Hors périmètre |

Deux adaptateurs (local, cache-enveloppe) rendent le seam réel ; un test de contrat commun
(`runTransportContract(factory)`) est exécuté sur chacun : état initial, mise à jour poussée,
perte puis retour de connexion, événement éphémère jamais mis en cache.

**À mesurer avant d'activer le cache** (jamais supposé) : le stockage d'une Browser Source OBS survit
à un redémarrage d'OBS, selon « Désactiver la source… » et « Rafraîchir… ». Case 9 du QA court
(`docs/inbox.md`) ; sonde : `dev/storage-probe.html`. Tant que ce n'est pas mesuré, `createCachedTransport` existe mais `background.html`
utilise le transport local seul.

### 1c. Critères de l'étape 1

- `background.html` ne contient plus de `WebSocket`, `fetch`, `URLSearchParams` : il assemble transport,
  montage et branding.
- `bun test` vert, aucune assertion existante modifiée sauf celles du `canvasPixelRatio`.
- Test de contrat de transport vu **rouge** sur une régression réinjectée (message `state` non diffusé),
  puis vert.
- Équivalence observée dans le navigateur : même fond, même branding, reconnexion après arrêt/relance du
  serveur d'état (écran inchangé pendant la coupure, resynchronisé au retour).

## Étape 2 — Horloge unique et squelette d'effet

### 2a. `Clock` (contexte de rendu)

```js
createRenderClock({ quality, now?, requestFrame?, cancelFrame? }) → {
  subscribe(fn: (frame) => void): () => void,   // frame = { dt, time, pixelRatio }
  setPaused(boolean), setQuality(quality), destroy(),
}
```

- **Une** boucle `requestAnimationFrame` pour toute la page, `dt` borné (reprise de `frameDeltaSeconds`),
  `time` = somme des `dt` (n'avance pas en pause, ne saute pas au retour d'un onglet suspendu).
- **Isolement** : une couche qui lève est désabonnée et journalisée ; les autres continuent. Un fond
  noir en live est pire qu'un effet figé.
- `now`/`requestFrame` injectables : la timeline (étape 8) et les tests pilotent le temps sans horloge réelle.
- `pixelRatio` vient de `quality` (plafond 2, 1 en `performance`) : plus de lecture de `location`.

### 2b. `defineCanvasLayer`

```js
defineCanvasLayer({
  create(options, ctxInfo) → { draw(ctx, frame, size), update?(options), onAudio?(level), trigger?(event) },
}) → fabrique `(options) => ComponentInstance`
```

Cache : élément canvas, `ResizeObserver`, ratio de pixels, abonnement à l'horloge, pause, destruction.
Un effet fournit uniquement `draw` et son état. Le contrat `ComponentInstance` gagne `setAudioLevel` et
`trigger` (aujourd'hui absents de `types.js`).

**Phase d'intégration** : `createBackgroundMount` reçoit l'horloge ; les effets non migrés gardent
leur boucle propre jusqu'à leur migration (aucune régression par défaut). `GeometricPatternBackground`
(CSS/WAAPI, pas de canvas) reste hors périmètre.

### 2c. Correction du saut de temps (A2)

Les effets migrés intègrent le mouvement (`position += vitesse × dt`) au lieu de
`timestamp × facteur`. Helper fourni : `createPhase()` → `{ advance(dt × facteur), value }`.

- **Test rouge d'abord** : sur l'effet actuel, changer le facteur à mi-parcours déplace la position
  (échec) ; sur l'effet migré, la position ne change pas (succès). Un test par effet concerné
  (StarsParallax, OrbitingShapes, Fireflies, Bubble, ShapeMorph, DotGrid).

### 2d. Ordre de migration (un effet par commit)

Du plus simple au plus risqué, chacun avec sonde de pixels et validation visuelle de l'owner :
`Rain` → `ColorDrops` → `FloatingSymbols` → `Fireflies` → `Bubble` → `WaterRipple` → `Stars` →
`OrbitingShapes` → `ShapeMorph` → `DotGrid` (705 lignes, en dernier) ; `ReactionOverlay` après les effets.

### 2e. Critères de l'étape 2

- Une seule boucle `requestAnimationFrame` dans la page de rendu (mesuré : nombre d'appels en 10 s).
- **Sonde de pixels** : mêmes pixels, à tolérance près, avant/après migration, pour un état et une graine
  figés ; **vue rouge** sur une régression réinjectée (par exemple un `dt` ignoré).
- Test d'isolement : une couche qui lève n'interrompt pas les autres et est journalisée.
- Mesure de charge de référence dans OBS (QA court case 3) **avant**, puis après chaque effet migré :
  pas de dégradation des FPS ni des images abandonnées.
- Contrôle visuel de l'owner par effet (impossible à automatiser : OBS est la référence).

## Hors périmètre

`LayerKind`, `SceneDoc`, couches multiples, timeline, nouveau Studio, cache activé par défaut, transport
cloud, EventSub. Les valeurs persistées (`'Oui'`/`'Non'`) restent inchangées jusqu'à l'étape 3.

## Risques

| Risque | Parade |
|---|---|
| Régression visuelle à la migration d'un effet | Un effet par commit, sonde de pixels, validation visuelle, ancien code restaurable par `git revert` |
| `dt` borné change le comportement après une pause longue | Voulu (même borne qu'aujourd'hui pour 5 effets) ; les 4 effets qui avaient un autre comportement sont listés dans le commit de leur migration |
| Un transport de remplacement masque une panne serveur | `onStatus` expose connecté/déconnecté ; le tuner l'affiche (déjà `#server-status`) |
| Le cache sert un état périmé | Réconciliation systématique à la connexion ; mesure OBS avant activation |

## Questions pour l'owner

1. Validez-vous l'ordre 1 → 2 et la migration effet par effet avec votre contrôle visuel dans OBS à chaque pas ?
2. `render-url.js` et `render-transport.js` à la racine (à plat, comme `background-mount.js`), en attendant
   l'arborescence `protocol/` `engine/` `host/` de l'étape 3 ?
