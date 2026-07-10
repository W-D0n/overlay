---
feature: background-effects-library
created: 2026-07-07
updated: 2026-07-07
status: draft
---

# Spec : background-effects-library (Track B de l'« Épopée », 8 sessions)

## Contexte

Track A (bibliothèque de transitions) est livrée (A1→A4, 138 tests). Track B était initialement
cadré dans la mémoire projet comme un chantier étroit : un unique cycle de formes (pizza ↔ étoile
ninja ↔ casque shredder ↔ carapace tortue ninja ↔ masque Batman) remplaçant DotGrid, déclenché
manuellement.

Recherche d'inspiration (owner, 2026-07-07, 23 CodePen analysés) a révélé un éventail de techniques
CSS/SVG pertinentes bien plus large qu'un simple morphing de silhouette : pluie, grille façon
Matrix/Tron, bulles, lucioles, symboles flottants configurables, motifs géométriques animés,
gouttes de couleur, étoiles en parallaxe, formes orbitales, DotGrid enrichi de variabilité
colorée par bruit. Clarification owner (AskUserQuestion, 2026-07-07) : Track B devient une
**bibliothèque de PLUSIEURS effets de fond indépendants**, chacun sélectionnable par scène avec
son propre jeu de paramètres — le cycle de formes original devient un effet parmi d'autres, pas
plus. Ces effets **remplacent** DotGrid (`#bg-layer` devient polymorphe, un seul effet actif à la
fois, même emplacement/cycle de vie que DotGrid aujourd'hui). Chaque effet a son propre toolset de
fine-tuning, exposé à la fois en config JSON ET en UI dédiée dans le panneau de dev (owner :
option 2, avec la remarque que `dev/placement-panel.html` n'est peut-être plus le bon nom vu
l'ampleur — voir LAC-01).

## Décision d'architecture — `#bg-layer` polymorphe

`DotGridBackground` est **déjà** un composant standard du registry (`component-registry.js` :
`DotGridBackground: DotGridAnimated`), monté comme n'importe quel autre via
`COMPONENT_REGISTRY[name](options)` (voir `scene-runtime.js` §Montage initial). Ce qui est
codé en dur aujourd'hui, c'est le **choix** du composant (toujours `DotGridBackground`) et son
paramètre (`SceneConfig.dotgridMode`, un mode fixe parmi 8).

**AD-B1 — Réutiliser `ComponentMount`, pas de nouveau type.** `SceneConfig.dotgridMode` (type
`DotGridMode`) est remplacé par `SceneConfig.background` (type `ComponentMount | null`), le même
type déjà utilisé pour les composants de couche (S8). Un effet de fond est un composant comme un
autre : `{ component: 'RainBackground', options: { intensity: 0.6, color: 'var(--color-gold)' } }`.
Aucun concept parallèle à maintenir — cohérent avec le principe additif de `scene-definition-v2.md`
(étendre l'existant plutôt que dupliquer).

**AD-B2 — Cycle de vie du composant de fond.** Le runtime garde une instance de composant de fond
courante (`currentBackground: ComponentInstance | null`, remplace `grid`/`currentDotgridMode`).
Au changement de scène :
- Même `component` qu'avant (ex. `RainBackground` → `RainBackground` avec des `options` différentes)
  → **pas de démontage** : `currentBackground.update?.(options)` (cohérent avec `ComponentInstance`
  existant, AC-02 S3 préservé : jamais de recréation inutile).
- `component` différent (ex. `RainBackground` → `BubbleBackground`) ou passage à `null` → démonte
  l'ancien (`destroy?.()`), monte le nouveau dans `#bg-layer`.
- `background === null` → `#bg-layer` masqué (remplace `resolveDotgridMode(null) → null`).

**AD-B3 — `morph` (Track A) généralisé.** La transition `morph` appelle
`currentBackground.morphTo?.(targetOptions, duration, easing)` **si** le composant de fond ne
change PAS entre les deux scènes et qu'il expose `morphTo` (méthode optionnelle sur
`ComponentInstance`, déjà implémentée par `DotGridBackground` en A3). Sinon (composant différent,
ou `morphTo` absent) → dégrade en `crossfade` simple sur le contenu, **rien à codé de neuf** ici :
c'est exactement le repli déjà écrit en A3 (LAC-01), juste sa condition de déclenchement qui se
généralise de « même `dotgridMode` » à « même `component` + `morphTo` disponible ». Aucun effet
autre que `DotGridBackground` n'implémente `morphTo` dans cette spec (zero preemptive code — à
ajouter seulement si un besoin concret de morph entre deux configs du même effet apparaît).

**AD-B4 — `DotGridBackground` migre sans régression visuelle.** `dotgridMode` (8 valeurs de scène)
devient une `option` du composant (`{ component: 'DotGridBackground', options: { mode: 'codage' } }`),
`GRID_MODES`/`MODE_PARAMS`/`morphTo` inchangés en interne. `resolveDotgridMode` (scene-resolve.js)
est retiré (plus de champ dédié à valider) ; la validation de `mode` devient la responsabilité du
composant lui-même (repli interne sur un mode par défaut si `mode` est invalide, même logique que
`DEFAULT_DOTGRID_MODE` mais encapsulée). Migration pure — aucun changement de rendu.

## Périmètre

**Inclus (8 sessions) :**
- B1 — cette session : spec + décomposition (pas de code).
- B2 — refactor fondation : `ComponentInstance` étendu (`morphTo` optionnel formalisé), `SceneConfig`
  (`background` remplace `dotgridMode`), runtime polymorphe (AD-B2/B3), migration `DotGridBackground`
  (AD-B4) sans régression. **Session bloquante** : tout le reste en dépend.
- B3 à B7 — implémentation des effets (batches de 2-3, voir §Inventaire), chacun avec son toolset de
  paramètres et sa section dans le panneau de dev.
- B8 — le cycle de formes original (pizza ↔ étoile ninja ↔ casque shredder ↔ carapace tortue ninja
  ↔ masque Batman), en dernier car techniquement le plus incertain (morphing SVG de silhouettes,
  pas juste de paramètres numériques comme DotGrid) — même logique de séquencement que `morph`
  en Track A (le plus incertain en dernier).

**Exclu :**
- Effets nécessitant une dépendance externe (jQuery, Trianglify, Velocity.js, plugin `noisy` —
  vus dans la recherche CodePen mais rejetés, violent la contrainte zero-dépendance du projet).
- Interactions souris (hover pour changer le vent de la pluie, clic pour éclair) — Browser Source
  OBS n'a pas de curseur (`pointer-events: none` sur tout l'overlay) ; les effets sont **ambiants
  uniquement**, aucun paramètre piloté par une interaction utilisateur en live.
- Textures externes (image PNG de bruit, texture foil métallique vues dans les CodePen source) —
  zero-dépendance : tout effet visuel est généré en CSS/JS natif (canvas, gradients, SVG), jamais
  un asset binaire chargé depuis un CDN tiers. Un effet qui en a besoin dans son CodePen source est
  réinterprété sans texture (couleur/dégradé de token à la place).
- Éclatement de bulles sur `BubbleBackground` : **inclus** en B-batch dédié (voir inventaire),
  demande explicite owner, pas une extension différée.

## Inventaire des effets (11)

Chaque effet est un composant `components/*.js` exposant `{ el, update(options), destroy, morphTo? }`
(contrat `ComponentInstance` existant), enregistré dans `component-registry.js`. Le nom devient une
valeur de `ComponentName` (extension, comme S8 a ajouté `Box`/`Divider`/etc.).

| # | Effet (`ComponentName`) | Source d'inspiration | Technique | Session |
|---|---|---|---|---|
| 1 | `DotGridBackground` | existant | Canvas + simplex noise | B2 (migration) |
| 2 | `RainBackground` | vishwaoffl | CSS `@property --angle`, gouttes | B3 |
| 3 | `MatrixGridBackground` | wheatup | grille 3D `perspective`/`rotateX`, ambiance Tron/Cyberpunk | B3 |
| 4 | `BubbleBackground` | diyorbek0309 | bulles montantes + **éclatement** (ajout demandé) | B4 |
| 5 | `FirefliesBackground` | mikegolus | particules dérivantes + flash lumineux | B4 |
| 6 | `FloatingSymbolsBackground` | wakana-k (généralisé) | glyphe/emoji flottant configurable (`symbol`), sans texture externe | B5 |
| 7 | `GeometricPatternBackground` | hexagoncircle, t_afif ×2, Cancepto | `conic-gradient`/`linear-gradient` animés, param `pattern`: `diamonds｜dots｜eyes｜angled` | B5 |
| 8 | `ColorDropsBackground` | nefejames (color-drip), natewiley (color-drops) | gouttes de couleur tombantes | B6 |
| 9 | `StarsParallaxBackground` | sarazond | 3 couches de points `box-shadow` générés en JS (pas codés en dur), vitesses différentes | B6 |
| 10 | `OrbitingShapesBackground` | nefejames (balls), robdimarzo, natewiley (tri-travelers) | formes en orbite 3D, param `shape`: `circle｜triangle` | B7 |
| 11 | `ShapeMorphBackground` | idée originale Track B | cycle pizza↔étoile↔casque↔carapace↔masque, SVG `<animate>` ou path morph JS, déclenchement manuel | B8 |

`DotGridBackground` enrichi en option (pas une session dédiée, ajout mineur dans B2 si le temps le
permet, sinon différé) : variabilité de couleur pilotée par bruit (inspiration jh3y — masque de
bruit qui fait varier la teinte des points), candidat naturel car le moteur simplex existe déjà.

## Acceptance Criteria (cadre général — un jeu par effet en Bx, ce tableau couvre B2)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `SceneConfig.background` (`ComponentMount \| null`) remplace `dotgridMode` partout (types, resolve, runtime, configs de scène existantes) | review + grep |
| AC-02 | Changement de scène avec même `background.component` → `update()` appelé, **jamais** de démontage/remontage (AD-B2) | visuel OBS |
| AC-03 | Changement de scène avec `background.component` différent → démontage de l'ancien puis montage du nouveau dans `#bg-layer` | visuel OBS |
| AC-04 | `background: null` → `#bg-layer` masqué, aucun composant monté | visuel OBS |
| AC-05 | Transition `morph` avec même `component` + `morphTo` disponible → appelle `morphTo`, contenu en crossfade parallèle (inchangé vs A3) | visuel OBS |
| AC-06 | Transition `morph` avec `component` différent (ou sans `morphTo`) → dégrade en crossfade simple, aucune erreur | test + visuel |
| AC-07 | `DotGridBackground` : aucune régression visuelle après migration (mêmes 8 modes, mêmes paramètres `MODE_PARAMS`) | visuel OBS |
| AC-08 | `resolveDotgridMode` supprimé de `scene-resolve.js` (plus consommé) ; validation de `mode` encapsulée dans `DotGridBackground` | review + grep |

## Types JSDoc (B2)

```js
// types.js — SceneConfig.background remplace dotgridMode
/**
 * @typedef {Object} SceneConfig
 * @property {SceneId} id
 * @property {ComponentMount | null} background - Effet de fond monté dans #bg-layer (remplace dotgridMode)
 * @property {SceneTransition} transition
 * @property {LayerConfig[]} layers
 */

// ComponentInstance — morphTo formalisé (déjà implémenté par DotGridBackground depuis A3)
/**
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el
 * @property {(data: unknown) => void} [update]
 * @property {(alert: unknown) => void} [show]
 * @property {(target: unknown, duration: number, easing: import('./types.js').TransitionEasing) => void} [morphTo]
 * @property {() => void} [destroy]
 */
```

## Format de données

```js
// scenes/data/codage.scene.json — DotGrid (migré, mode devient une option)
{
  "id": "codage",
  "background": { "component": "DotGridBackground", "options": { "mode": "codage" } },
  "transition": { "type": "morph", "duration": 800, "easing": "easeInOut" },
  "...": "..."
}

// Exemple : scène utilisant un nouvel effet
{
  "id": "brb",
  "background": { "component": "RainBackground", "options": { "intensity": 0.5, "color": "var(--color-gold)" } },
  "transition": { "type": "crossfade", "duration": 400, "easing": "easeInOut" },
  "...": "..."
}
```

## Fichiers (B2, fondation)

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | `SceneConfig.background`, `ComponentInstance.morphTo` formalisé |
| `scene-resolve.js` | modifier | retire `resolveDotgridMode` (AC-08) |
| `scene-resolve.test.js` | modifier | retire les tests `resolveDotgridMode` (T16-T19), plus rien à tester ici (encapsulé) |
| `scene-runtime.js` | modifier | `currentBackground` générique remplace `grid`/`currentDotgridMode`, `applyDotgridMode`→`applyBackground`, `morphDotgrid`→généralisé (AD-B2/B3) |
| `components/DotGridAnimated.js` | modifier | `mode` devient une option lue depuis `options.mode` (au lieu d'un `setMode()` externe), validation interne |
| `component-registry.js` | inchangé | `DotGridBackground` déjà enregistré |
| `scenes/data/*.scene.json` | modifier | chaque config existante : `dotgridMode` → `background: { component: 'DotGridBackground', options: { mode } }` |
| `docs/specs/scene-runtime-engine.md` | modifier | AD-7 (mention `dotgridMode`/`setMode`) mise à jour pour refléter le composant générique |

> Fichiers B3-B8 (un composant par effet) : détaillés au démarrage de chaque session respective,
> pas dans cette spec de cadrage (éviter la sur-planification à froid — le détail exact d'un effet
> peut évoluer entre le cadrage et son implémentation).

## Lacunes identifiées

- [x] **LAC-01** — Tranchée en session B7 : **conservé tel quel** (`dev/placement-panel.html`),
      pas de renommage. Avec la section Fond effectivement ajoutée (10 effets, ~70 lignes) sous les
      yeux, le renommage reste disproportionné par rapport au bénéfice : 11 fichiers référencent le
      nom actuel (`dev/component-field-schemas.js`, `dev/placement-server.js`, `dev/start-dev.js`,
      `scenes/registry.js`, et 4 specs historiques — `docs/specs/scene-placement-protocol.md`,
      `scene-definition-v2.md`, `scene-history-protocol.md`, `obs-scene-control.md` — qui
      documentent un état passé, pas à réécrire pour un renommage cosmétique). `dev/placement-server.js`
      reste un concern distinct et légitimement nommé (proxy des sauvegardes de placement, pas le
      panneau lui-même). Le placement/composition reste la majorité fonctionnelle du fichier (Fond
      + Transition ensemble ~10 % des lignes) — pas une redéfinition de son rôle central, une
      extension incrémentale d'un outil de dev interne (jamais user-facing).
- [x] **LAC-02** — Tranchée (owner, 2026-07-10) : implémentée. `DotGridAnimated.js` gagne
      `colorMode: 'flat' | 'noise'` (défaut `'flat'`, rétrocompatible) — en mode `'noise'`, la teinte
      de chaque point est modulée par un bruit Simplex indépendant de la couche 2 (opacité), via
      `hueShiftRgb`/`buildHueShiftLUT` (`components/color-utils.js`). Exposé en config JSON et dans
      `dev/placement-panel.html` (section Fond). Perf : LUT précalculée une fois par instance (61
      entrées) plutôt qu'une conversion HSL complète par point/frame — coût CPU jugé sensible en
      contexte stream (OBS/encodage/jeu partagent la machine). Bug trouvé et corrigé en review
      (2026-07-10) : `simplex2` peut légèrement dépasser [-1,1] (normalisation empirique), un index
      LUT non clampé aurait pu planter le rendu (`degToLUTIndex`, testé).
- [x] **LAC-03** — Tranchée (owner, 2026-07-10) : acceptée telle quelle, aucun changement. Un fond
      de stream n'a pas besoin de reproductibilité pixel-perfect entre deux lancements ; positions
      procédurales aléatoires par instance conservées.

## Décomposition des 8 sessions

1. **B1 — spec** (cette session, faite).
2. **B2 — fondation polymorphe** : `background` remplace `dotgridMode`, runtime générique,
   migration `DotGridBackground` sans régression (AC-01→08). **Bloquant pour B3-B8.**
3. **B3 — Rain + Matrix Grid** (ambiance orageuse / Tron-Cyberpunk).
4. **B4 — Bubbles (+ éclatement) + Fireflies**.
5. **B5 — Floating Symbols + Geometric Pattern**.
6. **B6 — Color Drops + Stars Parallax**.
7. **B7 — Orbiting Shapes** + décision LAC-01 (renommage panneau) + UI de fine-tuning par effet
   dans le panneau de dev (rétroactif sur B2-B6 : chaque effet livré avant B7 reçoit sa section UI
   ici, en un seul passage plutôt que dupliquer l'effort panneau à chaque session).
8. **B8 — ShapeMorphBackground** (cycle de formes original, le plus incertain).

Chaque session Bx (x≥2) suit le pattern Track A : implémentation → tests `bun test` pour la logique
pure → vérification visuelle OBS pour le rendu DOM/canvas (AD-1, non testable en `bun test`) →
debrief.

> Règle de cross-check (avant de déclarer B2 "done", puis répétée à chaque Bx) :
> - Chaque AC de la session → implémenté et vérifié
> - Aucune régression sur les scènes/effets déjà livrés (`bun test` complet + review visuelle)
> - Chaque fichier listé → modifié/créé conformément
