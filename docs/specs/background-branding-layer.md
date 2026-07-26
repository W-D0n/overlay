# Spec — Couche branding (⑤ de l'audit produit)

Statut : **à valider par l'owner**. Créée le 2026-07-26.

Décisions owner (2026-07-26) :

1. Contenu : **pseudo / texte** + **lignes de réseaux sociaux**. Pas de logo image, pas de cadre —
   ils pourront s'ajouter plus tard sans changer le contrat.
2. Rattachement : **les deux au choix** — intégrée à l'URL OBS du fond par défaut, et disponible
   seule via une URL dédiée.
3. Variabilité : **contenu global**, mais **masquable par preset**.
4. Placement : **libre, en pourcentage du canvas**, posé au **glisser-déposer** dans l'aperçu du
   tuner (2026-07-26). Le pourcentage reste juste quand le canvas change de taille ; la marge
   visuelle grandit avec la résolution, ce qui est le comportement retenu.

---

## Ce que ça résout

L'identité (pseudo, réseaux) est aujourd'hui absente du flux background-only : elle vivait dans le
moteur de scènes archivé. Elle doit revenir sans réintroduire de couches par scène.

## Format

Un bloc **global** dans le fichier d'état, à côté de `current`, `presets` et `sceneMap` :

```json
"branding": {
  "name": "D0n",
  "lines": ["twitch.tv/d0n", "@mozaik"],
  "x": 3,
  "y": 92,
  "nameSize": 28,
  "lineSize": 14,
  "color": "var(--color-gold)",
  "opacity": 0.9
}
```

| Champ | Valeurs | Défaut |
|---|---|---|
| `name` | texte, 0–40 caractères (vide = pas de pseudo affiché) | `''` |
| `lines` | tableau de textes, 0 à 4 lignes, 40 caractères chacune | `[]` |
| `x` / `y` | 0 à 100 (% du canvas) | `3` / `92` |
| `nameSize` / `lineSize` | 10 à 96 px / 8 à 48 px | `28` / `14` |
| `color` | valeur CSS libre (hex, `rgb()`, `oklch()`, `var(--token)`) | `var(--color-gold)` |
| `opacity` | 0 à 1 | `0.9` |

`branding` absent d'un fichier existant = valeurs par défaut, `name` vide et `lines` vide : **rien
ne s'affiche**. Aucune migration, aucun changement visible pour un état déjà sur disque.

**Pourcentage plutôt que pixels** : le canvas change de taille (1920×1080 hier, 2560×1440
aujourd'hui) et un pourcentage reste juste dans les deux cas. Conséquence assumée : une marge de 3 %
vaut 58 px en 1080p et 77 px en 1440p — la marge grandit avec l'écran.

**Le bloc s'aligne selon sa position**, sans réglage supplémentaire : posé dans la moitié droite, il
s'aligne à droite (`translateX(-100%)`) ; dans la moitié basse, il remonte (`translateY(-100%)`).
Sans cette règle, déposer le bloc près du bord droit le ferait déborder hors du canvas.

## Masquage par preset

Le preset porte un drapeau, à côté de `transition` :

```json
"showBranding": false
```

Absent = `true` : les presets existants affichent le branding. Le drapeau voyage dans l'état diffusé
(`current.showBranding`), comme la transition, pour que l'URL OBS sache quoi faire sans relire les
presets.

Régler le contenu du branding ne le fait jamais réapparaître sur un preset qui le masque.

## Les deux rattachements

| URL | Rend |
|---|---|
| `background.html` | Effet de fond **+** branding (si le preset ne le masque pas) |
| `background.html?branding=only` | **Branding seul**, fond transparent — à poser sur une capture, une cam, un gameplay |
| `background.html?branding=off` | Effet seul, branding jamais rendu |

`?branding=only` implique la transparence : c'est une couche à superposer, elle n'a pas de raison de
peindre un fond noir. `?preset=<id>` reste combinable (`?preset=x&branding=off`).

La couche est montée **au-dessus** des calques d'effet et de l'overlay de réaction — c'est
l'élément le plus lisible de l'écran, rien ne doit passer devant.

## Fichiers

| Fichier | Rôle | Nature |
|---|---|---|
| `branding-format.js` | Normalisation + validation du bloc, styles de position en pourcentage | **Pur, testé** |
| `components/BrandingLayer.js` | Composant `{ el, update(branding), destroy() }`, DOM pur (pas de canvas) | Nouveau |
| `background.html` | Montage, lecture des paramètres d'URL, application de `showBranding` | Existant, étendu |
| `dev/background-state-format.js` | `branding` dans le fichier, `showBranding` sur preset et `current` | Existant, étendu |
| `dev/background-state-server.js` | `POST /branding`, le mapping OBS (③) joint `showBranding` | Existant, étendu |
| `dev/background-tuner.html` + contrôleur | Section « Branding », glisser-déposer dans l'aperçu, case « Afficher sur ce preset » | Existants, étendus |

Le branding ne passe **pas** par `COMPONENT_REGISTRY` : ce n'est pas un effet de fond
interchangeable, c'est une couche permanente au contrat différent (`update(branding)`, pas
d'options d'effet, pas de réaction audio, pas de transition).

## Comportement

| Situation | Effet |
|---|---|
| `name` et `lines` vides | Rien n'est rendu, aucun élément dans le DOM |
| Preset avec `showBranding: false` | Couche démontée, pas seulement masquée en CSS |
| Changement de contenu depuis le tuner | Mise à jour en direct, sans transition (ce n'est pas un preset) |
| Transition entre presets | Le branding **ne participe pas** à la transition : il reste stable pendant que les fonds se croisent |
| `?branding=only` sans contenu | Page vide et transparente, aucune erreur |

## Critères d'acceptation

1. `normalizeBranding` : absent, `null`, champs inconnus, tailles hors bornes, `x`/`y` hors [0,100],
   `lines` trop longues ou trop nombreuses → défauts et bornes, jamais d'exception.
2. `validateBranding` : `x`/`y` hors bornes, `lines` non tableau, `opacity` hors [0,1] → erreurs listées.
3. Un fichier d'état sans `branding` reste valide et n'affiche rien.
4. `brandingStyles` : `x`/`y` produisent `left`/`top` en pourcentage, et l'alignement dérivé
   (aucune translation en haut à gauche, `-100%` horizontal au-delà de 50 % en x, idem en y).
5. `name` et `lines` vides → aucun nœud rendu.
6. `showBranding: false` sur le preset appliqué → couche absente du DOM.
7. `?branding=off` → couche absente même si le preset l'autorise ; `?branding=only` → couche
   présente et aucun effet monté.
8. `POST /branding` invalide → 400, fichier inchangé.
9. Le contenu est échappé : un `name` contenant `<script>` s'affiche comme du texte.
10. `bun test` vert + vérification en Browser Source réelle 2560×1440 (owner).

## Découpage en sessions atomiques

1. **Logique et format** — `branding-format.js`, `branding` + `showBranding` validés.
2. **Composant et rendu** — `components/BrandingLayer.js`, montage dans `background.html`,
   paramètres d'URL, `showBranding` respecté ; le mapping OBS joint le drapeau.
3. **Tuner** — section « Branding » (contenu, tailles, couleur, opacité) + **glisser-déposer du
   bloc dans l'aperçu** (met à jour `x`/`y`, affichés en lecture seule à côté) + case « Afficher sur
   ce preset ».
4. **Vérification** en Browser Source réelle + doc (`tuner-le-fond.md`, README).

## Hors périmètre

- Logo image et cadre graphique : le contrat `update(branding)` les accueillera sans refonte.
- Animation d'entrée/sortie du branding : il est permanent, c'est le fond qui bouge.
- Branding par scène OBS indépendamment du preset : le drapeau par preset couvre le besoin, et une
  scène est déjà associée à un preset (③).

## Lacunes assumées (LAC)

- **LAC-01** — Le texte n'est pas mis à l'échelle selon la taille du canvas : à 2560×1440, une
  taille réglée pour 1080p paraît plus petite. Un facteur automatique masquerait le réglage réel ;
  les tailles restent explicites, à ajuster une fois. À noter : la **position** suit la résolution
  (pourcentage), la **taille** non — c'est volontaire, pas une incohérence.
- **LAC-02** — Aucune protection contre un pseudo plus large que le canvas : le texte déborderait.
  Borné à 40 caractères, jugé suffisant sans ajouter une troncature qui surprendrait à l'écran.
