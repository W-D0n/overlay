---
name: overlay-design-research
description: Cadre toute session de recherche graphique, de design, ou de proposition visuelle pour l'overlay stream D0n/Mozaïk — en priorité les effets de fond (mode background-only, focus actuel du projet), mais aussi toute exploration d'inspiration (CodePen, Dribbble, captures d'écran, description libre). Utilise ce skill dès qu'une proposition graphique doit être livrée pour CET overlay, même si l'utilisateur ne dit pas explicitement "design" ou "graphique" — par exemple "trouve-moi une animation de fond", "inspire-toi de ce CodePen pour le fond", "je veux un truc qui pulse", ou "améliore tel effet". Le but : que toute proposition soit livrée dans le contrat existant (composant + registre + schéma de champs, immédiatement visible dans le tuner), jamais une maquette/image opaque à retraduire à la main plus tard.
---

# Recherche graphique — overlay D0n/Mozaïk

## Contexte projet (2026-07-14)

Le moteur de scènes (scènes, transitions, panneau `overlay-setting.html`) est **mis de côté** — il
reste dans le repo mais n'évolue plus. Le focus est le mode **background-only**
(`docs/specs/background-standalone.md`) : une URL OBS (`background.html`) qui ne rend que l'effet
de fond courant, piloté en live depuis `dev/background-tuner.html` (dropdown des effets, formulaire
généré, presets). Une session de recherche graphique typique porte donc sur **un nouvel effet de
fond** ou une variation d'un effet existant.

## Pourquoi ce skill existe

Ce projet a un contrat de composant **figé et testé** (voir
`docs/specs/background-standalone.md`, `docs/specs/background-effects-library.md`). Une session de
recherche graphique qui produit une image, une maquette Figma, ou un extrait de code générique
casse ce contrat : quelqu'un doit ensuite la retraduire à la main dans le format attendu, avec un
risque réel de dérive (couleur hors token, composant qui ne respecte pas le contrat). Ce skill
existe pour que la sortie d'une session de recherche soit **directement utilisable**, pas à
traduire.

Le principe central : **output = les 3 pièces déclaratives, pas une image.** Un nouvel effet de
fond livré = la factory `components/XxxBackground.js` + la ligne de registre
(`component-names.js` + `component-registry.js`) + l'entrée `BACKGROUND_FIELD_SCHEMAS`
(`dev/component-field-schemas.js`). L'effet apparaît alors immédiatement dans le dropdown du tuner
avec son formulaire de réglage — rien d'autre à toucher. Détail pas-à-pas :
`docs/guides/tuner-le-fond.md` §Ajouter une nouvelle animation.

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

### 2. Livraison en 3 pièces déclaratives — jamais de code orphelin

Un nouvel effet de fond n'est livré que si les 3 pièces sont là :

1. **La factory** — `components/XxxBackground.js` (contrat `ComponentInstance` ci-dessus).
2. **Le registre** — nom ajouté à `component-names.js` + factory dans `component-registry.js`
   (les tests de cohérence existants échouent si l'un des deux manque).
3. **Le schéma de champs** — entrée dans `BACKGROUND_FIELD_SCHEMAS`
   (`dev/component-field-schemas.js`) : c'est elle qui génère le formulaire de réglage du tuner.
   Chaque option de la factory doit y figurer, avec son `default` exact.

Une proposition sans schéma de champs est invisible dans le tuner et injouable dans OBS — elle
n'est pas livrée. Vérification : `bun test` + l'effet apparaît dans le dropdown de
`dev/background-tuner.html`.

(Le format `ComponentMount`/`placement` des scènes existe toujours dans `types.js`, mais le moteur
de scènes est mis de côté — ne livre dans ce format que si l'owner demande explicitement du travail
sur les scènes.)

### 3. `tokens.css` — source de vérité design

Toute couleur, typo, espacement, rayon de bordure référencé dans une proposition doit être un token
existant (`var(--color-gold)`, `var(--space-md)`, `var(--font-serif)`, etc.) — jamais une valeur
hexadécimale ou un `px` improvisé inline. Lis `tokens.css` avant de proposer une palette ou une
typo : la direction artistique **Atelier** (noir profond, or patiné, serif + monospace) est déjà
posée, ne la réinvente pas.

Exception (owner, 2026-07-14) : les **options couleur des effets de fond** sont des valeurs libres
réglées au tuner (`type: 'color'` ou `'colors'`, hex/rgb/oklch/var() + palette nommée) — un fond
peut sortir de la palette Atelier. Le `default` du schéma reste l'or `#C8B97A` sauf raison
thématique (ex. Matrix vert).

Si un vrai nouveau token semble nécessaire (une teinte qui n'existe pas encore, un espacement hors
échelle) : dis-le explicitement ("ce composant aurait besoin d'un nouveau token
`--color-xxx`, à ajouter à `tokens.css`"), ne l'improvise jamais en dur dans le composant. C'est un
signal à remonter, pas une décision à prendre seul en silence.

### 4. Un seul effet actif, une seule page

Le mode background-only rend **un seul effet à la fois** dans `#bg-layer` (`background.html`).
Ne propose jamais une composition qui suppose :
- plusieurs effets superposés simultanément (pas de système de calques d'effets),
- plusieurs Browser Sources pointant des pages différentes,
- du compositing géré par OBS lui-même (filtres, calques OBS) pour assembler le rendu.

Si une inspiration semble vouloir plusieurs calques (ex. étoiles + brume), réinterprète-la comme
**un seul composant** qui dessine ses couches en interne sur son propre canvas (comme
`StarsParallaxBackground` et ses profondeurs).

### 5. Zero-build, zero-dépendance

Toute proposition de code est HTML/CSS/JS natif, ES modules, sans bundler ni framework ni CDN.
Si l'inspiration source utilise une lib (GSAP, Three.js, une police via Google Fonts CDN...),
réinterprète l'effet avec les moyens du bord déjà dans le projet (canvas 2D natif, Web Animations
API, CSS pur, `components/simplex.js` pour du bruit procédural) — jamais en importer une nouvelle.
C'est déjà arrivé plusieurs fois (Track B, 11 effets de fond inspirés de CodePen) : voir
`docs/specs/background-effects-library.md` §Exclu pour des exemples concrets de ce qui a été
délibérément laissé de côté pour cette raison (textures externes, jQuery, Trianglify...).

## Déroulé d'une session de recherche

1. **Comprendre le besoin réel** avant de chercher de l'inspiration — quel moment du stream,
   quelle ambiance (calme, énergique, thématique) ? Un effet de fond est strictement ambiant :
   pas d'interaction souris (Browser Source OBS, `pointer-events: none`).
2. **Regarder l'existant d'abord** — les `components/*Background.js` couvrent déjà beaucoup de
   terrain (12 effets). Une nouvelle demande est souvent une variation de réglages d'un effet
   existant — dans ce cas la livraison est un preset (options exactes à saisir dans
   `dev/background-tuner.html`), pas un nouveau composant.
3. **Si une vraie inspiration externe est utile** (CodePen, capture, description), l'analyser pour
   en extraire la **technique** (quel mouvement, quelle formule, quel timing), pas pour copier une
   image — puis la retraduire immédiatement dans le contrat `ComponentInstance` ci-dessus.
4. **Livrer les 3 pièces**, jamais une image :
   - Un nouvel effet → factory + registre + entrée `BACKGROUND_FIELD_SCHEMAS` (contrainte 2),
     vérifié dans le tuner.
   - Une variation d'un effet existant → les `options` exactes, présentées comme un preset à
     sauvegarder dans le tuner.
5. **Signaler explicitement** tout ce qui sort des 5 contraintes (nouveau token nécessaire, lib
   externe qu'on ne peut pas éviter, effet qui semble vouloir plusieurs calques/sources) plutôt
   que de forcer une solution silencieusement dégradée.

## Pointeurs — ne pas dupliquer, lire à la demande

- `docs/guides/tuner-le-fond.md` — le mode background-only complet : URL OBS, tuner, presets, et
  la checklist exacte d'ajout d'une animation (§Ajouter une nouvelle animation — sans agent).
- `docs/guides/creer-un-composant.md` — squelette de factory complet, 4 leçons de performance
  (gradients recréés par frame, LUT couleur, `filter` + transform 3D, résolution de couleur token)
  tirées de bugs réels déjà rencontrés sur ce projet.
- `tokens.css` — palette, typo, espacements, rayons (à lire avant toute proposition de couleur/style).
- `docs/specs/background-standalone.md` — l'architecture du mode background-only (serveur d'état,
  protocole, validation).
- `docs/specs/background-effects-library.md` — la spec Track B qui a figé le contrat des effets,
  §Exclu pour les techniques déjà écartées (textures externes, jQuery, Trianglify...).
