# Guide — Créer un nouvel effet de fond

> Pour régler un effet déjà codé, voir `docs/guides/tuner-le-fond.md` — pas besoin d'écrire de code.
> Ce guide couvre le cas où l'effet n'existe PAS encore.

## Le contrat commun — `ComponentInstance`

Tout effet de fond est une fonction qui prend des `options` et retourne un objet de cette forme
(`types.js` §`ComponentInstance`) :

```js
export function MonComposant(options = {}) {
  const el = document.createElement('div'); // ou canvas pour un effet animé
  // construire el à partir de options...

  return {
    el,                          // obligatoire — élément DOM inséré par le runtime
    update(data) { /* ... */ },  // optionnel — rafraîchit avec de nouvelles données/options
    morphTo(opts, duration, easing) { /* ... */ }, // optionnel — transition douce
    trigger(payload) { /* ... */ }, // optionnel — réaction à une alerte stream (follow/sub/raid/bits)
    setAudioLevel(levels) { /* ... */ }, // optionnel — réaction au son (voir plus bas)
    destroy() { /* ... */ },     // optionnel mais fortement recommandé — cleanup (rAF, observers, timers)
  };
}
```

Aucune de ces méthodes optionnelles n'est obligatoire — `background-mount.js` vérifie leur présence
avant d'appeler (dégradation silencieuse si absente, jamais une erreur).

## Le squelette d'un effet (ex: neige, aurore, particules...)

Regarde un effet existant proche de ce que tu veux comme point de départ :
- **Particules/formes qui bougent** (canvas + `requestAnimationFrame`) : `RainBackground.js`,
  `FirefliesBackground.js`, `BubbleBackground.js` — tous suivent le même squelette.
- **Motif CSS répétitif animé** (sans canvas) : `GeometricPatternBackground.js`, adapté aux
  dégradés et motifs géométriques.

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

## Réagir aux alertes — `trigger()`

Pour qu'un effet réagisse aux alertes stream (follow/sub/raid/bits), implémente `trigger(payload)` —
il reçoit l'événement complet (`{ type, username, timestamp, amount? }`). Référence :
`components/DotGridAnimated.js` (4 comportements + minuteur `ambient`). Les effets qui ne
l'implémentent pas sont couverts par l'overlay partagé `components/ReactionOverlay.js`, rien à
câbler. Voir `docs/specs/background-reactive-events.md`.

## Réagir au son — `setAudioLevel()`

Pour qu'un effet réagisse au micro, implémente `setAudioLevel(levels)` — appelée au plus une fois
par frame avec `{ level, bass, mid, treble }`, quatre nombres dans `[0, 1]`.

```js
setAudioLevel(levels) {
  audioBass = Math.min(1, Math.max(0, levels?.bass ?? 0));
},
```

Trois règles qui évitent les pièges déjà rencontrés :

1. **Ne rien posséder** — l'effet reçoit des nombres. Il n'ouvre pas le micro, ne connaît ni
   `AudioContext` ni `getUserMedia` : `background-audio.js` s'en charge pour toute la page.
2. **Rester correct sans son** — si les appels s'arrêtent (micro perdu, preset non réactif), l'effet
   doit revenir à son animation normale, pas figer sur le dernier pic. Remets tes variables audio à
   zéro quand `update()` reçoit un `audioReactive` différent de `'Oui'`.
3. **Moduler, ne pas remplacer** — le son multiplie un paramètre existant. À niveau nul, le rendu
   doit être exactement celui d'un preset non réactif.

Déclare aussi les deux champs `audioReactive` et `audioIntensity` dans le schéma de l'effet
(`dev/component-field-schemas.js`) : c'est ce réglage, propre à chaque preset, qui autorise
l'ouverture du micro. Sans lui, `setAudioLevel` ne sera jamais appelée.

Pour une réaction ponctuelle (un impact par pic sonore plutôt qu'une modulation continue), réutilise
`isAudioPeak(previous, current)` de `audio-levels.js` — voir `BubbleBackground` et
`WaterRippleBackground`. Détail complet : `docs/specs/background-audio-reactivity.md`.
