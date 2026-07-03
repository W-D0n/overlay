# HANDOFF — Overlay Stream D0n / Mozaïk
# Session : Direction artistique → Système DotGrid animé
# Destination : Claude Code CLI sur poste local
# Date : Juin 2026

---

## Contexte projet

Streamer-développeur sous le pseudo **D0n**, entité commerciale **Mozaïk**.
Stream polyvalent : codage (SvelteKit/Bun/TS), jeu (UE5), création 3D (Blender),
dessin tablette, discussion, interview, react vidéo.

Projet long terme associé : **VaultCity** (simulation UE5, non prioritaire).

---

## Ce qui a été produit dans cette session

### Identité visuelle — Direction Atelier

- Palette :
  - `#0A0A0C` fond principal
  - `#C8B97A` or patiné (accent)
  - `#F2F0EC` blanc cassé (texte primaire)
  - `#9A9890` gris encre (labels)
  - `#1E1E22` règle/bordure
  - `#0D0D0F` fond widget
- Typographie : Times New Roman (titres serif) + Courier New / monospace (données)
- Motif signature : grille de points 20px espacement, rayon 1.4px, opacité 18%, couleur gold
- Barre dorée 2.5px en haut de chaque scène — élément unificateur constant
- Séparateurs verticaux `#1E1E22` 1px pour diviser les colonnes

### Fichiers produits (racine du repo)

> Note : structure aplatie — plus de sous-dossier `overlay/`, tout est à la racine du repo.

```
(racine du repo)
├── tokens.css            ← variables design centralisées (source de vérité)
├── types.js              ← JSDoc types (StreamState, ChatMessage, AlertEvent…)
├── store.js              ← état global WebSocket (OBS WS v5, ws://localhost:4455)
│                            + fallback statique + timer durée local
├── components/
│   └── index.js          ← DotGrid, GoldBar, StatBlock, ChatFeed,
│                            PomodoroBar, AlertBanner
└── scenes/
    ├── Discussion.html   ← cam grande + chat live + sujet + stats
    ├── Codage.html       ← IDE dominant + colonne droite + pomodoro
    ├── Jeu.html          ← fond transparent + HUD barre basse uniquement
    ├── BRB.html          ← plein écran + chat visible + prochain stream
    ├── Interview.html    ← split symétrique + fiches invité
    ├── React.html        ← source vidéo + cam réaction + crédit source
    ├── Creation3D.html   ← ?mode=A (widgets droite) ou ?mode=B (panneau référence)
    └── FinStream.html    ← récap + stats + liens + barre or pleine opacité
```

**Contraintes techniques :**
- HTML/CSS/JS natif ES modules — aucun build step, aucune dépendance
- OBS Browser Source 1920×1080, pointer events OFF
- Scène Jeu : `body { background: transparent }` — le jeu apparaît derrière
- Scène Creation3D : deux Browser Sources sur même URL avec `?mode=A` et `?mode=B`

### Pattern composant (à respecter pour tout nouveau composant)

```js
export function MonComposant(options) {
  const el = document.createElement('div');
  // construire el...

  return {
    el,
    update(data) { /* mettre à jour el */ },
    destroy() { /* nettoyage mémoire */ },
  };
}
```

### Protocole WebSocket store.js

Le store écoute ces types de messages :

| type | données | effet |
|---|---|---|
| `stream.stats` | `{ viewers, duration }` | stats temps réel |
| `chat.message` | `{ username, text, timestamp }` | nouveau message |
| `alert.follow` | `{ username, timestamp }` | alerte follow |
| `alert.sub` | `{ username, timestamp, amount }` | alerte sub |
| `alert.raid` | `{ username, timestamp, amount }` | alerte raid |
| `alert.bits` | `{ username, timestamp, amount }` | alerte bits |
| `poll.update` | `PollState` | vote en cours |
| `poll.end` | — | fin vote |
| `pomodoro.tick` | `PomodoroState` | tick timer |
| `context.update` | `{ activity, file, branch, tool, subject, song }` | contexte |
| `session.start` | `{ id }` | début session |
| `morph.trigger` | `{ prompt?, sdf?, imageUrl?, duration? }` | ← À AJOUTER |

---

## Travail suivant — DotGridAnimated.js

### Objectif

Remplacer le composant `DotGrid` statique (canvas simple) par `DotGridAnimated` —
un système de fond vivant, contextuel, réactif aux événements stream,
capable de se morphoser en formes arbitraires.

À créer dans : `components/DotGridAnimated.js`

### Architecture — 4 couches superposées

```
DotGridAnimated.js
│
├── Couche 1 — Base aléatoire (init au chargement)
│   └── Chaque point reçoit au démarrage :
│       - phase    : Math.random() * Math.PI * 2
│       - amplitude: 0.05 + Math.random() * 0.08
│       - speed    : 0.3 + Math.random() * 0.4
│   └── Résultat : aucun chargement identique
│
├── Couche 2 — Bruit ambiant contextuel (Perlin/Simplex 2D + temps)
│   └── noise(x * freqX, y * freqY, time * freqT) → [-1, 1]
│   └── Paramètres selon mode scène :
│
│   Mode         freqX  freqY  freqT  amplitude  description
│   ──────────────────────────────────────────────────────────
│   discussion   0.03   0.03   0.4    0.12       vagues douces, social
│   codage       0.01   0.01   0.1    0.04       quasi immobile, focus
│   brb          0.02   0.02   0.2    0.10       calme, quelques étoiles
│   interview    0.04   0.02   0.3    0.10       deux foyers d'activité
│   react        0.05   0.05   0.6    0.15       nerveux, réactif
│   creation     0.02   0.04   0.25   0.08       vague diagonale lente
│   fin          0.02   0.02   0.15   0.06       se retire vers les bords
│
├── Couche 3 — Morphisme de forme (prioritaire sur C1+C2 quand actif)
│   │
│   ├── Source A — Bitmap (image PNG/SVG)
│   │   loadShape(url) → Float32Array[gridW * gridH] valeurs [0..1]
│   │   Algo : OffscreenCanvas gridW×gridH, drawImage, getImageData,
│   │          luminosité = R*0.299 + G*0.587 + B*0.114 / 255
│   │
│   ├── Source B — SDF mathématique (calcul local, instantané)
│   │   generateShapeSDF(descriptor) → Float32Array
│   │   SDFs à implémenter :
│   │     circle(cx, cy, r)
│   │     ring(cx, cy, r, thickness)
│   │     star(cx, cy, r, branches, innerRatio)
│   │     wave(amplitude, frequency, phase, axis)
│   │     lightning(x1,y1, x2,y2, thickness, jaggedness)
│   │     rect(cx, cy, w, h)
│   │   Combinateurs :
│   │     sdfUnion(a, b)        = Math.min(a, b)
│   │     sdfSubtract(a, b)     = Math.max(a, -b)
│   │     sdfIntersect(a, b)    = Math.max(a, b)
│   │     sdfSmoothUnion(a,b,k) = formule Inigo Quilez
│   │   Conversion distance → opacité :
│   │     opacity = 1 - smoothstep(-feather, feather, sdfValue)
│   │
│   ├── Source C — IA générative (appel API Anthropic)
│   │   promptToShapeMap(prompt) → Float32Array
│   │   Flux :
│   │     1. Vérifier cache Map<string, Float32Array>
│   │     2. POST https://api.anthropic.com/v1/messages
│   │        model: 'claude-sonnet-4-20250514', max_tokens: 1000
│   │        system: voir ci-dessous
│   │     3. Parser SVG retourné
│   │     4. SVG string → Blob → URL → Image → OffscreenCanvas 96×54
│   │     5. getImageData → Float32Array → mettre en cache
│   │
│   │   System prompt API :
│   │   "Tu es un générateur de formes SVG pour animation de grille de points.
│   │    Reçois une description en français, retourne UNIQUEMENT un SVG valide :
│   │    viewBox='0 0 96 54', fond noir #000000, forme blanche #ffffff,
│   │    silhouette simple, pas de dégradé, pas de texte, contour net,
│   │    lisible à très petite résolution. Aucun commentaire, juste le SVG."
│   │
│   └── Interpolation morphTo(shapeMap, options)
│       options: { duration=2000, hold=3000, easing='easeInOut', fadeOut=1500 }
│       Algo : pour chaque point, lerp(currentOpacity, targetOpacity, progress)
│              progress = easing(elapsed / duration)
│              Phases : morph-in (duration) → hold → morph-out (fadeOut)
│              Pendant hold : légère oscillation organique sur la forme
│
└── Couche 4 — Événements discrets (Niveau 3)
    ├── trigger('follow')
    │   → Onde circulaire expansive depuis coin aléatoire
    │   → Durée 2s, rayon 0→max, opacité décroissante sur le front
    │
    ├── trigger('sub')
    │   → morphTo SDF étoile 5 branches centrée, duration 4s, hold 3s
    │
    ├── trigger('raid')
    │   → Vague frontale gauche→droite, bande verticale qui traverse
    │   → Durée 3s, largeur bande ~15% écran
    │
    ├── trigger('bits')
    │   → Cluster aléatoire : 20–40 points s'illuminent en positions random
    │   → Durée 1.5s, scatter puis fondu
    │
    └── trigger('ambient') [appelé automatiquement]
        → Intervalle : 45000 + Math.random() * 45000 ms
        → Choisit aléatoirement parmi :
          - 'breath'    : souffle local sur une zone 200×200 aléatoire
          - 'ripple'    : onde lente depuis centre
          - 'constellation' : 5–8 points s'allument et se relient par traits fins
          - 'sdf_random': forme SDF simple aléatoire (cercle, étoile, vague)

### Interface publique complète

```js
/**
 * @param {{
 *   mode?: 'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin',
 *   spacing?: number,
 *   dotRadius?: number,
 *   baseColor?: [number,number,number],
 *   baseOpacity?: number,
 * }} options
 */
export function DotGridAnimated(options = {}) {
  // ...

  return {
    el,            // HTMLCanvasElement, positionné absolute inset:0

    setMode(mode), // changer le comportement ambiant (C2)

    trigger(eventType), // 'follow'|'sub'|'raid'|'bits'|'ambient'

    async morphTo({
      source,    // url string | { type, ...sdfParams } | { prompt: string }
      duration,  // ms morph-in
      hold,      // ms maintien
      easing,    // 'easeInOut'|'easeIn'|'easeOut'|'linear'
      fadeOut,   // ms morph-out
    }),

    destroy(),   // cancelAnimationFrame + cleanup
  };
}
```

### Intégration dans les scènes existantes

Remplacer dans chaque scène (sauf Jeu.html) :

```js
// AVANT
import { DotGrid } from '../components/index.js';
const grid = DotGrid();
document.getElementById('dot-grid').replaceWith(grid.el);

// APRÈS
import { DotGridAnimated } from '../components/DotGridAnimated.js';
const grid = DotGridAnimated({ mode: 'discussion' }); // adapter le mode
document.getElementById('dot-grid').replaceWith(grid.el);

// Brancher les événements stream
let lastAlertTs = 0;
onStateChange((state) => {
  if (state.latestAlert && state.latestAlert.timestamp !== lastAlertTs) {
    lastAlertTs = state.latestAlert.timestamp;
    grid.trigger(state.latestAlert.type);
  }
});
```

Modes par scène :
- Discussion.html  → `mode: 'discussion'`
- Codage.html      → `mode: 'codage'`
- BRB.html         → `mode: 'brb'`
- Interview.html   → `mode: 'interview'`
- React.html       → `mode: 'react'`
- Creation3D.html  → `mode: 'creation'`
- FinStream.html   → `mode: 'fin'`
- Jeu.html         → NE PAS modifier (fond transparent, pas de DotGrid)

### Ajouter morph.trigger dans store.js

Dans la fonction `handleMessage(msg)`, ajouter le case :

```js
case 'morph.trigger':
  // msg.data = { prompt?, sdf?, imageUrl?, duration?, hold? }
  // Le store ne peut pas appeler directement grid (couplage inversé)
  // → Utiliser un EventEmitter léger ou un CustomEvent DOM

  document.dispatchEvent(new CustomEvent('overlay:morph', {
    detail: msg.data
  }));
  break;
```

Dans la scène, écouter l'événement :

```js
document.addEventListener('overlay:morph', (e) => {
  grid.morphTo(e.detail);
});
```

### Implémentation Simplex 2D recommandée

Porter l'implémentation de Stefan Gustavson (domaine public, MIT-like).
Source de référence : https://weber.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf
Signature attendue : `simplex2(x, y) → [-1, 1]`
Pas de librairie npm — implémenter from scratch en ~80 lignes pour
rester dans la contrainte zero-dépendance du projet.

---

## Priorités d'implémentation (ordre suggéré)

1. **Couches 1 + 2** — base aléatoire + Perlin ambiant par mode
   → Valider visuellement avant d'aller plus loin
   → Tester sur BRB.html en premier (la plus visible)

2. **Couche 4 partielle** — trigger follow + sub + raid
   → Connecter au store.js existant
   → Tester avec des appels manuels depuis la console OBS

3. **Intégration toutes scènes** — remplacer DotGrid dans les 7 scènes

4. **Couche 3A** — morphisme bitmap (loadShape depuis PNG)
   → Commencer par le logo Mozaïk en PNG noir/blanc

5. **Couche 3B** — SDFs mathématiques
   → circle, star, wave en priorité

6. **Couche 4 complète** — trigger ambient + constellation

7. **Couche 3C** — morphisme IA (API Anthropic → SVG → bitmap)
   → Ajouter en dernier, nécessite gestion cache et latence réseau

---

## Stack technique globale

| Domaine | Stack |
|---|---|
| Overlays | HTML/CSS/JS natif ES modules, zero build |
| Hub (MyVault) | SvelteKit + Bun + TypeScript + PostgreSQL/Drizzle |
| OBS | WebSocket v5 (port 4455 par défaut) |
| Jeu | Unreal Engine 5 |
| 3D | Blender 4.x |
| Dessin | Tablette graphique / iPad |
| Mobile | Flutter/Dart |
| Backend secondaire | Python/FastAPI |

---

## Profil développeur

- Pseudo stream : **D0n** / D0natelll0
- Twitch : twitch.tv/d0natelll0
- YouTube : @D0natelll0-i4q
- Entité commerciale : **Mozaïk**
- Localisation : La Réunion
- Niveau dev : junior frontend (certif RNCP niveau 6, React-oriented)
- Profil : neurodivergent TDAH

**Consignes pédagogiques importantes :**
- Micro-tâches : découper chaque feature en étapes de 15–30 min max
- Une notion à la fois : ne pas introduire plusieurs concepts simultanément
- Feedback rapide : valider visuellement à chaque étape avant de continuer
- Documentation explicite : commenter le code, expliquer les décisions
- Pas de jargon sans explication immédiate
- Préférer la progression visible à l'architecture parfaite d'emblée

---

## Assets produits dans la session (à récupérer)

- `overlay.zip` — projet overlay complet (HTML/CSS/JS)
- `overlay_refs.zip` — 8 PNG 1920×1080 de référence visuelle
- `dotgrid_bg.png` — texture grille de points seule (RGBA transparent)
  → utilisable comme sprite After Effects ou référence pour animations

---

## Notes de design à respecter

- Le fond doit rester **lisible et discret** en état ambiant
  (les overlays texte passent par-dessus)
- Les animations ne doivent jamais distraire du contenu principal
  sauf lors d'événements stream explicites (follow, sub, raid)
- La scène Jeu est exclue de toute animation — performance prioritaire
- Les formes pour le morphisme doivent être des **silhouettes simples**
  (la grille fait 96×54 points — pas assez de résolution pour le détail)
- Chaque chargement doit être **unique** (Couche 1 garantit ça)
- Les transitions doivent être **fluides** — jamais de cut brutal
