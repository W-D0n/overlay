---
created: 2026-10-29
updated: 2026-10-29
---

# Spec — Studio en trois zones (refonte de l'écran du tuner)

Statut : **validée (ordre Z1 → Z3 → Z2 → Z4 → Z5, cadre 16:9 simple, scènes sans preset repliées) ; Z1 livré le 2026-10-29.** Traite les constats U2 à U6 de
[`../ux-review.md`](../ux-review.md) (U1, brouillon / publication, est livré). Étapes 1 à 3 du socle sont
livrées : l'écran peut être refait sans le refaire deux fois.

Périmètre : **l'écran existant** (`dev/studio.html`, `dev/background-tuner.html`,
`dev/background-tuner-runtime.js` et leurs contrôleurs). Le modèle de scène en couches (`SceneDoc`, étape 4
de l'architecture) n'en fait pas partie : cet écran reste celui d'**un fond par preset**, organisé pour
accueillir plus tard une liste de couches sans nouvelle refonte.

## Problème (mesuré dans `ux-review.md`, 1920×1080)

| # | Constat | Cause dans le code |
|---|---|---|
| U3 | L'aperçu remplit ≈ 1580×1026, pas un 16:9 : le branding (en %) et la taille des effets ne correspondent pas à OBS | `#bg-layer` épouse la zone restante de la page |
| U2 | Créer, essayer, enregistrer, assigner sont dispersés sur trois onglets ; la transition d'arrivée est sous « Habillage », loin du preset | Onglets `Fond / Habillage / Diffusion` (`workspace-tabs.js`) par thème technique |
| U4 | 41 listes déroulantes « aucun » pour les scènes OBS, sans filtre ni scène active | `obs-scene-map-presenter.js` : une ligne `<select>` par scène |
| U5 | Titre redondant, double barre de défilement (iframe + panneau), panneau de 324 px | `studio.html` embarque le tuner dans une `<iframe>` ; `#sidebar` fixe |
| U6 | Vignettes quasi noires pour les effets discrets | `MIN_INK_RATIO` et 4 essais de 500 ms dans `preset-thumbnail.js` |

## Conception

Trois zones, un seul état visible : **ce qui est en antenne** et **ce qui est en brouillon**.

```
┌ Overlay Studio ─────────────────────────────────────────────────────────────┐
│ Rail gauche (320)    │ Centre                     │ Panneau droit (360)     │
│ ▸ Scènes OBS         │ ┌ Brouillon · [Publier] ┐  │ Effet : <sélection>     │
│   filtre, active ★   │ │ [Annuler]             │  │  réglages (schéma)      │
│ ▸ Bibliothèque       │ └───────────────────────┘  │ Réaction (test)         │
│   départs + mes      │ cadre 16:9 = 1920×1080     │ Arrivée de ce preset    │
│ ▸ Branding           │ mis à l'échelle            │                         │
│ ▸ Prêt pour le live  │                            │                         │
└──────────────────────┴────────────────────────────┴─────────────────────────┘
```

### Z1. Cadre 16:9 fidèle (U3) — livré (`dev/preview-stage.js`)

- Le fond est rendu dans un conteneur **1920×1080 réel** (mêmes dimensions que la source OBS), mis à
  l'échelle par une transformation CSS pour tenir dans la zone centrale. Les effets calculent donc leur
  taille sur 1920×1080 : l'aperçu montre ce qu'OBS affichera, branding compris.
- Le cadre est un 16:9 fixe, bande neutre autour (pas de zone de sécurité tant que l'owner n'en veut pas).
- Coût de rendu : le canvas reste en 1920×1080 quelle que soit la fenêtre ; l'échelle est un coût GPU
  de composition. **À mesurer** (FPS du compteur existant) avant de valider.
- Vérification : le même preset, le même instant, dans le cadre et dans une source OBS 1920×1080 : même
  composition (comparaison de captures, pas de lecture à l'œil).

### Z2. Bibliothèque unique (U2)

Une seule liste : « Points de départ » (intégrés) et « Mes presets » regroupés, avec filtre de texte. Une
ligne = vignette, nom, effet, actions (Essayer, Enregistrer sous, Supprimer pour les personnels). La
transition d'arrivée passe dans le panneau droit, au même endroit que le preset qu'elle concerne.
`background-preset-controller.js` et `background-preset-presenter.js` sont conservés (deux listes
fusionnées par la présentation, pas deux contrôleurs).

### Z3. Scènes OBS lisibles (U4)

Liste filtrable (champ de recherche), **scène active en tête et marquée**, preset associé affiché sous
forme de vignette + nom, une seule action « Associer… » par ligne au lieu d'une liste déroulante. Les
scènes sans association sont repliées sous un compteur (« 38 sans preset »). La logique de
`obs-scene-map-controller.js` reste ; seule la présentation change.

### Z4. Mise en page (U5)

- Une seule page, sans `<iframe>` : le Studio devient l'hôte du tuner (grille CSS à trois colonnes),
  ce qui supprime la double barre de défilement et le titre redondant.
- Les onglets `Fond / Habillage / Diffusion` disparaissent ; le rail gauche remplace « Diffusion » et
  « Habillage » (branding), le panneau droit remplace « Fond ».
- `studio.config.js` (liste de vues) devient inutile : seule vue restante, à supprimer plutôt qu'à vider.
- Repli : un seul rail repliable, état mémorisé par préférence de confort (`localStorage` toléré).

### Z5. Vignettes discrètes (U6) — chantier séparé

Hypothèse non mesurée : 4 essais de 500 ms ne suffisent pas pour des effets lents. À instrumenter
(taux d'encre réel par effet et par essai) avant de choisir entre allonger, normaliser le contraste de la
vignette, ou capturer plus tard. Pas de correction à l'aveugle.

## Ordre de livraison (un commit par pas, `bun test` vert, vérification dans Chromium à 1920×1080)

1. **Z1** cadre 16:9 + mesure FPS avant/après.
2. **Z3** liste des scènes (le plus gros gain d'usage, logique inchangée).
3. **Z2** bibliothèque unique + transition d'arrivée dans le panneau droit.
4. **Z4** grille à trois zones, suppression de l'iframe, des onglets et de `studio.config.js`.
5. **Z5** instrumentation puis correction des vignettes.

Les pas 1 à 3 se livrent dans l'ancienne mise en page ; le pas 4 la remplace. Si le pas 4 est refusé, 1 à 3
restent utiles.

## Critères de succès (observés, pas déduits)

- Z1 : preset identique dans le cadre du Studio et dans une source OBS : branding et motifs à la même
  place (captures comparées) ; FPS du compteur du tuner inchangé à ±5 %.
- Z3 : avec 41 scènes, trouver une scène par texte en ≤ 2 interactions ; la scène active est la première
  ligne et son preset est visible sans ouvrir de liste.
- Z2 : « Essayer » un point de départ et « Enregistrer » un preset se font sans changer d'onglet ni de zone.
- Z4 : aucune barre de défilement imbriquée à 1920×1080 ; aucune `<iframe>` dans `studio.html`.
- Le brouillon / publication (`#publish-bar`) garde exactement son comportement : tests existants
  `background-draft.test.js` inchangés et verts.
- Contraste : textes ≥ 4,5:1 (tokens existants), contrôlé par la mesure du DOM comme dans la revue.

## Revue produit des éléments existants (2026-10-29, à trancher)

Constats tirés du code, pas de mesures dans OBS.

| Élément | Constat | Recommandation |
|---|---|---|
| **Qualité de rendu** (`Auto` / `Performance OBS`) | Son seul effet est le plafond du ratio de pixels (2 en auto, 1 en performance, `render-clock.js`, `canvas-runtime.js`). Il ne joue que si `devicePixelRatio` > 1. Hypothèse (non mesurée) : une Browser Source OBS rend à 1, auquel cas le réglage ne change rien dans OBS. Le menu recharge l'aperçu et ajoute `quality=performance` à l'URL | Retirer du Studio ; garder `?quality=performance` dans l'URL (coût nul, déjà documenté). À mesurer d'abord : afficher `devicePixelRatio` dans `storage-probe.html` et le lire dans OBS |
| **Avant le live** | Quatre contrôles : serveur d'état lisible, effet connu, URL copiable, mesure locale. Il ne vérifie ni qu'OBS affiche la page ni que la page est connectée au serveur ; la mesure « FPS » est celle de l'aperçu du Studio, pas d'OBS. Il vérifie surtout ce que l'écran montre déjà (statut serveur, état du brouillon) | Remplacer par un bandeau d'antenne permanent : serveur d'état, connexion OBS, scène active, bouton « Copier l'URL ». Un contrôle de bout en bout (la page OBS est-elle connectée ?) a plus de valeur que quatre vérifications locales. Demande que le serveur expose le nombre de pages connectées : à vérifier |
| **Onglets Fond / Habillage / Diffusion** | Découpage par thème technique : le branding et la transition d'un preset sont ensemble, la bibliothèque et l'association de scènes aussi | Supprimés au pas Z4 (voir plus haut) |

## Hors périmètre

Liste de couches, ordre, verrouillage (étape 4), placement à la souris, timeline, nouveaux types de
couches, traduction. La police (U7) reste à trancher séparément (direction artistique).

## Risques

| Risque | Parade |
|---|---|
| Le cadre 1920×1080 mis à l'échelle ralentit l'aperçu sur un petit écran | Mesure au pas Z1 ; repli : canvas à échelle réduite avec rapport de zoom documenté |
| La refonte casse le brouillon / publication | Tests existants inchangés ; vérification manuelle Publier / Annuler avant de commencer le pas 4 |
| `localStorage` des onglets mémorisés devient orphelin | Clé supprimée au pas 4 ; aucune donnée utile (confort seul) |
| Serveurs de l'owner en cours d'exécution pendant les tests | Ports de test dédiés (`STATIC_PORT`, `BACKGROUND_STATE_PORT`), jamais 5931/5932 sans accord |

## Décisions à prendre

1. **Ordre** : Z1 → Z3 → Z2 → Z4 → Z5, ou Z4 (mise en page) d'abord ? Recommandation : l'ordre proposé,
   parce que chaque pas est utile seul et que la mise en page vient quand son contenu est prêt.
2. **Cadre de l'aperçu** : 16:9 sans zone de sécurité (proposé), ou avec marges de sécurité affichées ?
3. **Scènes sans preset** : repliées sous un compteur (proposé), ou toutes visibles ?
4. **Police (U7)** : conserver `Courier New` partout (identité « Atelier »), ou sans-serif pour labels et
   aides et monospace pour les valeurs ? Peut se trancher après le pas 4.
