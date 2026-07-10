---
name: overlay-design-research
description: Cadre toute session de recherche graphique, de design, ou de proposition visuelle pour l'overlay stream D0n/Mozaïk — que ce soit un nouveau widget, un nouvel effet de fond, une révision d'une scène existante, ou une exploration d'inspiration (CodePen, Dribbble, captures d'écran, description libre). Utilise ce skill dès qu'une proposition graphique doit être livrée pour CET overlay, même si l'utilisateur ne dit pas explicitement "design" ou "graphique" — par exemple "trouve-moi des idées pour la scène pause", "je veux un truc qui pulse quand quelqu'un follow", "inspire-toi de ce CodePen pour le fond", ou "améliore visuellement telle scène". Le but : que toute proposition soit livrée dans le format de config existant (chargeable immédiatement dans l'éditeur), jamais une maquette/image opaque à retraduire à la main plus tard.
---

# Recherche graphique — overlay D0n/Mozaïk

## Pourquoi ce skill existe

Ce projet a un format de composant et un format de config **figés et testés** (voir
`docs/specs/scene-definition-v2.md`, `docs/specs/scene-placement-protocol.md`,
`docs/specs/background-effects-library.md`). Une session de recherche graphique qui produit une
image, une maquette Figma, ou un extrait de code générique casse ce contrat : quelqu'un doit ensuite
la retraduire à la main dans le format attendu, avec un risque réel de dérive (mauvaise couche,
couleur hors token, widget qui ne respecte pas le contrat de composant). Ce skill existe pour que la
sortie d'une session de recherche soit **directement utilisable**, pas à traduire.

Le principe central : **output = config, pas image.** Une proposition de widget ou d'effet de fond
est un objet `ComponentMount` (ou une factory de composant), jamais une capture d'écran ou un
prototype HTML autonome déconnecté du projet.

## Les 5 contraintes non négociables

Avant de proposer quoi que ce soit, vérifie que la proposition respecte ces 5 points. Si l'un
d'eux est en tension avec ce que l'utilisateur demande, dis-le explicitement plutôt que de
l'ignorer silencieusement — ces contraintes viennent de décisions déjà prises avec l'owner, pas
d'une préférence de style.

### 1. Format de composant figé — `ComponentInstance`

Tout widget (couche) ou effet de fond est une factory JS qui retourne exactement :

```js
{
  el: HTMLElement,              // obligatoire
  update?(data),                // rafraîchir avec de nouvelles données/options
  show?(alert),                 // déclenchement impératif (ex: AlertBanner)
  morphTo?(options, duration, easing), // transition douce (fonds animés)
  trigger?(payload),            // réaction à un événement discret (alertes stream)
  destroy?(),                   // cleanup (rAF, observers, timers)
}
```

N'invente jamais un widget avec une autre forme (pas de classe, pas de composant React/Vue/Svelte,
pas de web component). Si l'inspiration vient d'un CodePen ou d'une lib quelconque, la question
n'est jamais "comment l'importer" mais "comment réécrire ce comportement dans ce contrat" — voir
`docs/guides/creer-un-composant.md` pour le squelette exact et des exemples réels
(`components/*.js`).

### 2. Format de placement figé — `ComponentMount`

Un composant monté dans une scène est déclaré ainsi (`types.js`) :

```js
{
  component: 'NomDuComposant',    // ComponentName existant, ou à ajouter au registry
  options: { /* props du composant */ },
  placement: { x, y, width, height }, // OPTIONNEL, pixels absolus, canvas fixe 1920×1080
  trigger: { method: 'trigger', when: 'latestAlert' }, // OPTIONNEL, déclencheur déclaratif
}
```

Une proposition de nouveau widget dans une scène = un objet de cette forme (ou plusieurs), pas une
description en prose de "où il devrait être". Si tu ne connais pas encore les coordonnées exactes,
propose une position raisonnable et indique qu'elle se règle ensuite au pixel près depuis
`dev/overlay-setting.html` (glisser-déposer) — voir `docs/guides/utiliser-le-panneau.md`.

Un effet de fond suit exactement le même `ComponentMount` (`SceneConfig.background`, Track B,
`#bg-layer` polymorphe) — pas de format séparé pour "widget" vs "fond".

### 3. `tokens.css` — source de vérité design

Toute couleur, typo, espacement, rayon de bordure référencé dans une proposition doit être un token
existant (`var(--color-gold)`, `var(--space-md)`, `var(--font-serif)`, etc.) — jamais une valeur
hexadécimale ou un `px` improvisé inline. Lis `tokens.css` avant de proposer une palette ou une
typo : la direction artistique **Atelier** (noir profond, or patiné, serif + monospace) est déjà
posée, ne la réinvente pas.

Si un vrai nouveau token semble nécessaire (une teinte qui n'existe pas encore, un espacement hors
échelle) : dis-le explicitement ("ce composant aurait besoin d'un nouveau token
`--color-xxx`, à ajouter à `tokens.css`"), ne l'improvise jamais en dur dans le composant. C'est un
signal à remonter, pas une décision à prendre seul en silence.

### 4. Recentrage C — une seule Browser Source

L'overlay est **une page unique** (fond animé + widgets data-driven), servie comme **une seule**
Browser Source OBS. Ne propose jamais une composition qui suppose :
- plusieurs Browser Sources pointant des pages différentes,
- du compositing géré par OBS lui-même (calques OBS séparés, filtres OBS) pour assembler le rendu.

Le compositing se fait DANS la page (couches `data-layer`, `#bg-layer` + `#scene-root`), pas entre
plusieurs sources OBS. Si une inspiration (ex. un CodePen à plusieurs calques indépendants) semble
naturellement vouloir plusieurs sources, réinterprète-la comme plusieurs couches DOM dans la même
page.

### 5. Zero-build, zero-dépendance

Toute proposition de code est HTML/CSS/JS natif, ES modules, sans bundler ni framework ni CDN.
Si l'inspiration source utilise une lib (GSAP, Three.js, une police via Google Fonts CDN...),
réinterprète l'effet avec les moyens du bord déjà dans le projet (canvas 2D natif, Web Animations
API, CSS pur, `components/simplex.js` pour du bruit procédural) — jamais en importer une nouvelle.
C'est déjà arrivé plusieurs fois (Track B, 11 effets de fond inspirés de CodePen) : voir
`docs/specs/background-effects-library.md` §Exclu pour des exemples concrets de ce qui a été
délibérément laissé de côté pour cette raison (textures externes, jQuery, Trianglify...).

## Déroulé d'une session de recherche

1. **Comprendre le besoin réel** avant de chercher de l'inspiration — quelle scène, quel moment du
   stream, quelle émotion/fonction (ambiance de fond vs. réaction à un événement vs. widget
   d'information continue) ? Un widget qui affiche une donnée live n'a pas le même besoin qu'un
   effet de fond ambiant.
2. **Regarder l'existant d'abord** — `components/index.js` et `components/*Background.js` couvrent
   déjà beaucoup de terrain (13 widgets, 11 effets de fond). Une nouvelle demande est souvent une
   variation de configuration d'un composant existant (voir `docs/guides/utiliser-le-panneau.md`),
   pas un nouveau composant.
3. **Si une vraie inspiration externe est utile** (CodePen, capture, description), l'analyser pour
   en extraire la **technique** (quel mouvement, quelle formule, quel timing), pas pour copier une
   image — puis la retraduire immédiatement dans le contrat `ComponentInstance`/`ComponentMount`
   ci-dessus.
4. **Livrer la proposition en config**, jamais en image :
   - Un nouveau composant → squelette de factory (voir `docs/guides/creer-un-composant.md`) + un
     exemple de `ComponentMount` montrant comment l'utiliser dans une scène.
   - Une variation de config sur l'existant → directement l'objet `ComponentMount`/`options` à
     coller (ou à saisir dans le panneau).
5. **Signaler explicitement** tout ce qui sort des 5 contraintes (nouveau token nécessaire, lib
   externe qu'on ne peut pas éviter, effet qui semble vouloir plusieurs Browser Sources) plutôt que
   de forcer une solution silencieusement dégradée.

## Pointeurs — ne pas dupliquer, lire à la demande

- `docs/guides/creer-un-composant.md` — squelette de factory complet, checklist de fichiers à
  toucher (registry, types, schéma de champs), 4 leçons de performance (gradients recréés par
  frame, LUT couleur, `filter` + transform 3D, résolution de couleur token) tirées de bugs réels
  déjà rencontrés sur ce projet.
- `docs/guides/utiliser-le-panneau.md` — ce qui est déjà éditable sans écrire de code (composition,
  effets de fond, placement) depuis `dev/overlay-setting.html`.
- `tokens.css` — palette, typo, espacements, rayons (à lire avant toute proposition de couleur/style).
- `docs/specs/scene-definition-v2.md`, `scene-placement-protocol.md`,
  `background-effects-library.md` — les specs qui ont figé les formats ci-dessus, utiles si un
  détail précis manque (ex: contraintes de validation exactes d'un `Placement`).
