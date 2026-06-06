# Overlay Atelier — D0n / Mozaïk

Habillage stream complet pour OBS Browser Source.  
Direction artistique : **Atelier** — noir profond, or patiné, grille de points, typographie serif + mono.

---

## Structure

```
overlay/
├── tokens.css          ← Toutes les variables de design (couleurs, typo, espacements)
├── types.js            ← Types JSDoc (documentation des données, autocomplétion VS Code)
├── store.js            ← État global — WebSocket + fallback statique
├── components/
│   └── index.js        ← Composants réutilisables : DotGrid, GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner
└── scenes/
    ├── Discussion.html  ← Just Chatting
    ├── Codage.html      ← Session de codage
    ├── Jeu.html         ← Session de jeu (fond transparent)
    ├── BRB.html         ← Pause / Be Right Back
    ├── Interview.html   ← Interview invité
    ├── React.html       ← React à des vidéos
    ├── Creation3D.html  ← Création 3D / Dessin (?mode=A ou ?mode=B)
    └── FinStream.html   ← Fin de stream
```

---

## Configuration OBS

### Ajouter une scène

1. Dans OBS : **Sources → + → Browser Source**
2. Cocher **Local file**
3. Sélectionner le fichier `.html` correspondant
4. Dimensions : **1920 × 1080**
5. Décocher **Interact with page** (pointer events désactivés)
6. Laisser **Custom CSS** vide

### Ordre des sources dans OBS (par scène)

Pour chaque scène OBS, empilez les sources dans cet ordre (bas → haut) :

```
[Capture jeu / IDE / logiciel]   ← source principale
[Webcam]                          ← positionnée manuellement dans la zone "cam"
[overlay/scenes/NomScene.html]    ← Browser Source par-dessus
```

### Scène Jeu spécifiquement

`Jeu.html` a un **fond transparent** (`body { background: transparent }`).  
Le jeu apparaît à travers l'overlay — seule la barre HUD basse et la cam mini sont opaques.

### Scène Création 3D — deux variantes

- `Creation3D.html` → Variante A (capture + colonne widgets)  
- `Creation3D.html?mode=B` → Variante B (capture + panneau référence + widgets réduits)

Créez deux Browser Sources pointant sur la même URL avec des paramètres différents.

---

## Connecter les données (WebSocket)

Modifier dans `store.js` :

```js
// Ligne 13
const WS_URL = 'ws://localhost:4455'; // OBS WebSocket v5
```

### Protocole de messages attendus

Le store écoute ces événements :

| Type | Données | Description |
|---|---|---|
| `stream.stats` | `{ viewers, duration }` | Stats temps réel |
| `chat.message` | `{ username, text, timestamp }` | Nouveau message chat |
| `alert.follow` | `{ username, timestamp }` | Nouveau follow |
| `alert.sub` | `{ username, timestamp, amount }` | Nouveau sub |
| `alert.raid` | `{ username, timestamp, amount }` | Raid entrant |
| `alert.bits` | `{ username, timestamp, amount }` | Bits |
| `poll.update` | `{ question, yesRatio, totalVotes }` | Vote en cours |
| `poll.end` | — | Fin du vote |
| `pomodoro.tick` | `PomodoroState` | Tick du timer |
| `context.update` | `{ activity, file, branch, tool, subject, song }` | Contexte activité |
| `session.start` | `{ id }` | Début de session |

### Mode statique (sans WebSocket)

Sans WebSocket, le store utilise les valeurs de `STATIC_FALLBACK` (ligne ~40 de `store.js`).  
Le minuteur de durée démarre automatiquement en local.  
Modifier `STATIC_FALLBACK` pour personnaliser l'affichage hors-ligne.

---

## Personnaliser le design

Tout est dans `tokens.css`. Un seul fichier à modifier pour propager les changements à toutes les scènes.

### Changements fréquents

```css
/* Changer la couleur d'accent */
--color-gold: #C8B97A;

/* Changer la typo des titres */
--font-serif: 'Playfair Display', Georgia, serif;

/* Changer la taille de la grille de points */
--dot-spacing: 20px;  /* espacement */
--dot-opacity: 0.18;  /* opacité */
```

### Charger une Google Font dans les scènes

Ajouter dans chaque `<head>` avant `tokens.css` :
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
```

---

## Ajouter un widget

Dans `components/index.js`, suivre le pattern :

```js
export function MonWidget(options) {
  const el = document.createElement('div');
  // ... construire el

  return {
    el,
    update(data) {
      // ... mettre à jour el
    },
  };
}
```

Dans une scène :
```html
<div id="mon-widget"></div>
<script type="module">
  import { onStateChange } from '../store.js';
  import { MonWidget }     from '../components/index.js';

  const widget = MonWidget();
  document.getElementById('mon-widget').appendChild(widget.el);

  onStateChange((state) => {
    widget.update(state.quelqueChose);
  });
</script>
```

---

## Notes techniques

- **Pas de build step** — HTML/CSS/JS natif, ES modules. OBS Browser Source supporte les modules.
- **Pas de framework** — volontaire, pour éviter une dépendance dans un contexte live.
- **Résolution fixe 1920×1080** — définie dans `body` via `tokens.css`. Ne pas modifier sans adapter les positions dans les scènes.
- **Police de secours** — si Times New Roman n'est pas disponible (Linux), Georgia prend le relais. Pour une rendu exact, charger Playfair Display via Google Fonts.
- **WebSocket v5** — OBS 28+ utilise le protocole WebSocket v5. Si vous utilisez une version plus ancienne, adapter `store.js` au protocole v4.
