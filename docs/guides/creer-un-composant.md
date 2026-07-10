# Guide — Créer un nouveau composant ou effet de fond

> Pour tweaker ce qui existe déjà (composants/effets déjà codés), voir
> `docs/guides/utiliser-le-panneau.md` — pas besoin d'écrire de code.
> Ce guide couvre le cas où le type de composant/effet n'existe PAS encore.

## Le contrat commun — `ComponentInstance`

Tout composant (widget de couche OU effet de fond) est une fonction qui prend des `options` et
retourne un objet avec cette forme (`types.js` §`ComponentInstance`) :

```js
export function MonComposant(options = {}) {
  const el = document.createElement('div'); // ou canvas pour un effet animé
  // construire el à partir de options...

  return {
    el,                          // obligatoire — élément DOM inséré par le runtime
    update(data) { /* ... */ },  // optionnel — rafraîchit avec de nouvelles données/options
    show(alert) { /* ... */ },   // optionnel — déclenchement impératif (ex: AlertBanner)
    morphTo(opts, duration, easing) { /* ... */ }, // optionnel — transition douce (fonds animés)
    trigger(payload) { /* ... */ }, // optionnel — réaction à un événement discret (DotGrid Couche 4)
    destroy() { /* ... */ },     // optionnel mais fortement recommandé — cleanup (rAF, observers, timers)
  };
}
```

Aucune de ces méthodes optionnelles n'est obligatoire — le runtime les appelle toujours via `?.()`
(dégradation silencieuse si absente, jamais une erreur).

## Cas A — Un widget de couche (ex: un nouveau type de compteur, un badge, une liste)

Regarde `components/index.js` pour des exemples simples (`Badge`, `TextLabel`) avant d'écrire le
tien — la plupart des besoins courants s'expriment avec `Box`/`Divider`/`TextLabel`/`TextList`
existants sans code nouveau (juste de la config, voir le guide précédent).

**Fichiers à toucher pour un VRAI nouveau type :**

| Fichier | Action |
|---|---|
| `components/index.js` (ou un nouveau fichier `components/MonComposant.js` si substantiel) | Écrire la factory |
| `component-registry.js` | Importer + ajouter au `COMPONENT_REGISTRY` |
| `types.js` | Ajouter le nom à `ComponentName` (union type) |
| `dev/component-field-schemas.js` | Ajouter un schéma dans `COMPONENT_FIELD_SCHEMAS` (les champs éditables depuis le panneau) — voir le format `FieldSchema` documenté en tête de fichier |
| `components/MonComposant.test.js` | Tester toute logique pure (formatage, calculs) — pas le DOM lui-même (voir plus bas) |

Une fois ces 4 fichiers à jour, le composant apparaît automatiquement dans le sélecteur "+
composant" du panneau — aucun autre câblage nécessaire.

## Cas B — Un nouvel effet de fond animé (ex: neige, aurore, particules...)

Regarde un effet existant proche de ce que tu veux comme point de départ :
- **Particules/formes qui bougent** (canvas + `requestAnimationFrame`) : `RainBackground.js`,
  `FirefliesBackground.js`, `BubbleBackground.js` — tous suivent le même squelette.
- **Motif CSS répétitif animé** (pas de canvas, juste CSS + Web Animations API) :
  `GeometricPatternBackground.js`, `MatrixGridBackground.js` — moins cher en CPU si ton effet s'y
  prête (dégradés, grilles, motifs géométriques).

**Squelette canvas/rAF minimal (copie-le et adapte) :**

```js
// @ts-check
import { resolveColor } from './color-utils.js'; // si tu acceptes une couleur en option

export function MonEffetBackground(options = {}) {
  let intensity = options.intensity ?? 0.5;
  let color = options.color ?? 'var(--color-gold)';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = canvas.getContext('2d');

  let cssW = 0, cssH = 0, rafId = 0;
  let rgb = resolveColor(color); // résolu UNE FOIS, jamais par frame (voir §Performance)

  function handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    cssW = w; cssH = h;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
    // ... dessiner ici, utiliser `rgb` (pas resolveColor(color) à chaque frame) ...
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    update(newOptions) {
      const o = newOptions ?? {};
      if (typeof o.intensity === 'number') intensity = o.intensity;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}
```

**Fichiers à toucher :**

| Fichier | Action |
|---|---|
| `components/MonEffetBackground.js` | La factory (squelette ci-dessus) |
| `component-registry.js` | Importer + ajouter au `COMPONENT_REGISTRY` |
| `types.js` | Ajouter le nom à `ComponentName` |
| `dev/component-field-schemas.js` | Ajouter un schéma dans `BACKGROUND_FIELD_SCHEMAS` |

Une fois fait, l'effet apparaît dans le menu déroulant "Fond" du panneau.

## Performance — leçons apprises cette session (contexte stream, CPU partagé avec OBS/jeu/encodage)

Deux bugs de performance réels ont été trouvés et corrigés dans les effets existants — évite-les
dans un nouveau composant :

1. **Ne jamais recréer un objet canvas coûteux (`createLinearGradient`, etc.) dans `tick()`** —
   le construire une fois hors de la boucle de rendu (ou une fois par changement d'option), puis le
   réutiliser/repositionner via `ctx.translate()`. Voir `components/ColorDropsBackground.js` pour un
   exemple concret (gradient en coordonnées locales + translate par frame).
2. **Ne jamais recalculer une conversion de couleur coûteuse (HSL↔RGB) par point/par frame** si le
   résultat est déterministe pour un nombre fini de valeurs — précalculer une table de correspondance
   (LUT) une fois. Voir `components/DotGridAnimated.js` (`buildHueShiftLUT`)/`color-utils.js`.
3. **Éviter `filter:` CSS (`drop-shadow`, `blur`) sur un élément animé en continu** — combiné à un
   transform 3D, c'est un cas connu de saccades/flicker dans le rendu offscreen d'OBS (CEF). Préférer
   un effet équivalent sans `filter` (gradients superposés, `box-shadow` statique).
4. **Résoudre une couleur token (`resolveColor`, DOM-dépendant) UNE SEULE FOIS**, jamais par frame —
   stocker le RGB résolu, recalculer seulement si l'option `color` change (`update()`).

## Tests

- Toute logique **pure** (calculs, formatage, validation — pas de `document`/`canvas`) doit avoir un
  fichier `.test.js` à côté, `bun test` à la racine du projet.
- La partie DOM/canvas elle-même (la factory appelée avec un vrai `document.createElement`) n'est
  **pas** testable dans `bun test` (pas de DOM dans Bun) — vérifie-la visuellement en navigateur
  (`bun dev/start-dev.js`, ouvrir l'onglet preview) ou demande une vérification via un agent.

## Effets de fond `trigger()` (Couche 4 DotGrid)

Si ton composant de fond doit réagir aux alertes stream (follow/sub/raid/bits), implémente
`trigger(payload)` — reçoit l'objet `AlertEvent` complet (`{type, username, timestamp, amount?}`).
Voir `components/DotGridAnimated.js` pour l'implémentation de référence (4 comportements +
minuteur `ambient`). Aucun autre effet de fond ne l'implémente aujourd'hui (zero preemptive code) —
si tu veux que `RainBackground` réagisse aussi aux alertes par exemple, ajoute `trigger()` dessus,
rien à changer côté `scene-runtime.js` (déjà générique, voir `applyBackgroundReactions`).
