---
created: 2026-10-30
updated: 2026-10-30
---

# Spec — Éditeur de couches (étape 6)

Statut : **D2 et D3 tranchées par l'owner le 2026-10-30** ; D1 et D4 proposées, sans objection à ce jour (décisions en bas). Étape 6 de `docs/architecture-review.md` §5, après les étapes 4
(document de scène, moteur) et 5 (serveur décomposé, historique, brouillons). Cadrage d'origine : `studio-cadrage.md`
(« Éditeur v1 : aperçu fidèle, liste de couches (ordre, visibilité, verrouillage), placement à la souris, formulaires générés par schéma »).

## 1. Où l'on part

- Le moteur monte déjà des scènes à plusieurs couches (`scene-runtime.js`, 3 couches vues à 1080p et 1440p ; 8 couches mesurées dans OBS :
  CPU 1,4 %, GPU 7 % pour la page).
- Tout le reste ne connaît **qu'un effet par scène** : `BackgroundCurrent = { component, options, transition?, showBranding? }` dans le
  serveur (état, historique, brouillons, presets), le client, le Studio (session d'aperçu, brouillons), les vignettes et la page de rendu
  (via `sceneFromCurrent`). Le fichier d'état persiste déjà des documents de scène (version 3), mais le serveur refuse à la lecture une
  scène à plusieurs couches.
- 17 fichiers hors tests lisent `component` ou `options` à plat.

## 2. Principe

Le **document de scène devient le modèle partout**, et l'éditeur l'écrit. Pas de couche de compatibilité durable : un adaptateur
unique (`sceneFromCurrent` / `presetFromScene`, déjà présent) sert les seuls clients qui n'ont pas été rechargés.

## 3. Ce que l'éditeur doit offrir (périmètre premium, owner 2026-10-30)

L'éditeur est un outil de **création et d'édition complet**, pas un panneau posé sur le formulaire d'un effet. Chaque famille
ci-dessous est livrée, pas esquissée ; l'ordre de livraison est en §4.

| Famille | Outils |
|---|---|
| **Modèle d'édition** | Une scène brouillon unique ; opérations atomiques (ajouter, supprimer, dupliquer, réordonner, renommer, régler une propriété, transformer) ; **annulation / rétablissement** sans limite pratique, qui regroupe un glissement ou un curseur en une seule entrée ; sélection multiple ; abonnement des vues |
| **Liste de couches** | Vignette vivante par couche, glisser-déposer pour réordonner, œil / cadenas / solo, renommage en place, menu d'ajout par galerie d'effets avec aperçu, isoler, borne de 8 couches visible (jauge de charge) |
| **Propriétés** | Formulaire généré par schéma pour l'effet de la couche ; opacité ; **mode de fusion** ; position, taille et **rotation** en champs numériques (% du canvas ou pixels de référence, proportions verrouillables) ; rognage ; réglages d'image (flou, luminosité, contraste, saturation, teinte) ; **alignement et répartition** (sur la toile ou sur la sélection), tailles et positions prédéfinies (plein cadre, moitiés, tiers, coins, incrustation), réinitialisation |
| **Toile** | Manipulation directe : déplacer, redimensionner par 8 poignées, pivoter, redimensionner depuis le centre (Alt), conserver les proportions (Maj) ; **aimantation** aux bords, centres et marges de la toile et des autres couches avec **repères intelligents et distances** ; sélection au rectangle ; zoom, déplacement de la vue, règles, grille, zones de sécurité ; flèches (pas fin / grand) ; couche verrouillée intouchable |
| **Flux de travail** | Raccourcis clavier avec aide, **palette de commandes** (Ctrl+K), copier / couper / coller de couches (aussi d'une scène à l'autre), dupliquer, **avant / après** (brouillon contre antenne), **récapitulatif des changements à la publication**, historique d'édition consultable |
| **Scènes** | Les presets deviennent des scènes ; vignettes de scène ; modèles de départ ; import et export complets (couches comprises) ; brouillon par scène (existant) |
| **Fiabilité** | Le rendu de l'éditeur est celui d'OBS (même moteur, même repère 1920×1080) ; coût de chaque nouveauté de rendu **mesuré** (CPU / GPU) avant d'être proposée ; un live n'est jamais touché avant « Publier » |

Hors périmètre de l'étape 6 (étape 7 et suivantes) : images clés et timeline, entrées / sorties par couche, médias, widgets, groupes
imbriqués (modèle à part, voir 6h).

## 4. Découpage

| Pas | Contenu | Visible ? |
|---|---|---|
| **6a-0 — Le branding devient une couche** (D3) — **livré** | Nouveau type de couche `branding` (monté par `BrandingLayer`, contenu lu sur le canal global existant) ; migration du fichier d'état en **version 4** avec sauvegarde `pre-v4.bak` : une scène qui affichait le branding (`showBranding` absent ou vrai) reçoit une couche `branding` en tête, pleine toile, et perd `showBranding`. `?branding=only` et `?branding=off` de la page de rendu deviennent des filtres sur ce type de couche. Le moteur de scène garde les couches d'identité dans un calque à part, au-dessus des scènes : sans cela le branding s'estompait (68 % mesuré) et se doublait pendant une transition, alors qu'il reste fixe aujourd'hui. Équivalence ancienne page ↔ nouvelle page vue sur 9 cas (défaut, masqué, aucun fond, contenu modifié en direct, pendant et après une transition, `?branding=off`, `?branding=only`), détectée en échec quand on retire ce calque ; migration vérifiée sur une copie du fichier réel. | Non |
| **6a — Modèle de bout en bout**, en trois temps : **6a-1** le modèle interne du serveur est la scène, l'API reste plate à la frontière (`dev/state-wire.js`) — **livré** ; **6a-2** routes et canaux de scènes, refus des scènes à plusieurs couches levé — **livré** ; **6a-3** la page de rendu monte la scène du serveur (`selectScene`, `liveSceneOf`) — **livré** ; un preset affiché par `?preset=` garde désormais sa transition et son branding masqué, que la forme plate perdait. La lecture par le Studio (aperçu, liste, vignettes, brouillons) est portée par 6b : son état d'édition y devient une scène, et la lire avant n'aurait donné qu'une interface de lecture seule à jeter. Limite jusque-là : une scène à plusieurs couches publiée par l'API n'est pas montrée par le Studio (sa projection plate est vide) | Le serveur lit, écrit, diffuse, historise et met en brouillon des scènes (une ou plusieurs couches). L'API et les canaux portent des scènes ; une scène à une couche garde la forme historique pour les pages OBS non rechargées. Le Studio, les vignettes et la page de rendu lisent des scènes. | Non (aucun changement d'écran) |
| **6b — Modèle d'édition et liste de couches**, en trois temps : **6b-1** `dev/scene-editor.js` (commandes atomiques, annulation regroupée, sélection multiple, verrou) — **livré** ; **6b-2** le Studio travaille sur des scènes (`dev/studio-document.js` : scène brouillon, antenne, preset ouvert, brouillon calculé ; aperçu, liste des presets de toutes formes, vignettes composées, brouillons et historique en scènes ; publication par la route de scènes) — **livré**, vérifié dans un navigateur réel (18 contrôles, 2 régressions réinjectées détectées) ; **6b-3** panneau de couches — **livré** (`dev/layers-panel-controller.js`, `layers-panel-view.js`) : vignettes par couche, glisser-déposer, œil et cadenas, barre d'outils de la sélection (isoler, dupliquer, supprimer, monter, descendre), renommage en place, sélection multiple (Ctrl, Maj), galerie d'ajout, jauge de charge, annuler / rétablir (boutons et Ctrl+Z), raccourcis clavier de la liste ; vérifié par pilotage réel du navigateur (28 contrôles : clics, glisser, clavier ; 3 régressions réinjectées détectées). Deux défauts d'interface trouvés par ce pilotage et corrigés : des boutons invisibles volaient le clic de sélection, et le texte des lignes était réduit à 11 px. Limites de 6b-2 : l'export de presets reste plat (les scènes à plusieurs couches n'y figurent pas, le message le dit) ; changer l'effet d'un preset chargé ne le détache plus du preset (« Mettre à jour » le modifie). | Module pur `scene-edit` (opérations, annulation / rétablissement avec regroupement, sélection multiple, abonnement), testé sans navigateur ; l'état d'édition du Studio devient une scène brouillon (aperçu, liste des presets de toutes formes, vignettes, brouillons, publication par la route de scènes) ; panneau de couches complet (vignettes, glisser-déposer, œil / cadenas / solo, renommage, galerie d'ajout, jauge de charge) | Oui |
| **6c — Propriétés** — **livré** (`dev/layer-inspector-controller.js`, `dev/placement-math.js`) : opacité, position et taille en % ou en pixels de la source, proportions liées (rapport en pixels), « Mixte » sur plusieurs couches, positions prédéfinies (15), alignement sur la toile ou la sélection, répartition, réinitialiser ; vérifié par pilotage réel du navigateur (19 contrôles, 3 régressions réinjectées détectées). Défaut trouvé par ce pilotage et corrigé aussi dans le panneau de couches : réécrire l'icône d'un bouton entre l'appui et le relâchement de la souris faisait perdre le clic (`setIcon`). Reste du pas 6c d'origine (formulaire d'effet par schéma) : déjà en place, il règle la couche ciblée depuis 6b-2. | Inspecteur de la couche sélectionnée : schéma de l'effet, opacité, position / taille en % ou px, proportions verrouillables, alignement et répartition, positions prédéfinies, réinitialisation | Oui |
| **6d — Rendu étendu** | Extensions du document de scène et du moteur : mode de fusion, rotation, rognage, réglages d'image ; validation, forme canonique, migration (champs absents = valeurs neutres, donc fichier v4 inchangé) ; **coût mesuré dans OBS** (CPU / GPU, 8 couches) avant exposition ; inspecteur étendu | Oui |
| **6e — Toile interactive** | Sélection, poignées (déplacement, taille, rotation), aimantation et repères intelligents, sélection au rectangle et multiple, zoom et déplacement de vue, règles, grille, zones de sécurité, flèches ; couche verrouillée intouchable | Oui |
| **6f — Flux de travail** | Raccourcis et aide, palette de commandes, presse-papiers de couches, avant / après, récapitulatif à la publication, historique d'édition consultable | Oui |
| **6g — Scènes et bibliothèque** | Presets = scènes (vocabulaire « scène », D1), vignettes de scène, modèles de départ, import / export en version 3 (couches comprises) | Oui |
| **6h — Groupes** | Groupes de couches (sélection, transformation et masquage communs) : évolution du modèle, décidée après usage de 6b à 6g | Oui |

Chaque pas se livre en commits séparés, `bun test` vert, preuve en navigateur (interaction réelle, pas seulement des tests de logique),
mutations sur les gardes ; 6a était gardé par les tests d'intégration existants et par une équivalence pour les scènes à une couche.

## 5. Décisions à valider

1. **D1 — Vocabulaire** : l'interface dit « preset » aujourd'hui. *Proposé* : « scène » à partir de 6g (pas avant : l'éditeur de
   couches n'apparaît qu'en 6b).
2. **D2 — Placement : tranché par l'owner (2026-10-30)** : champs numériques en 6c (position et taille en % du canvas), puis la souris
   en 6e. Le champ numérique est testable et utile à lui seul.
3. **D3 — Branding : tranché par l'owner (2026-10-30)** : le branding **devient une couche de scène** ; son **texte reste global**
   (réglé une fois dans le panneau Branding, diffusé sur son canal comme aujourd'hui), le **placement, l'opacité et la visibilité sont par
   scène**. Aucune migration du contenu : seul le fichier d'état change de version (6a-0). Un preset qui masquait le branding
   (`showBranding: false`) n'a simplement pas de couche `branding`. Pour une scène « un effet + branding pleine toile » (le cas
   d'aujourd'hui), la forme historique reste projetable (`component`, `options`, `showBranding`) pour les pages non rechargées.
4. **D4 — Types de couches proposés par l'éditeur** : les 11 effets existants et le branding (`layer-kinds.js`), aucun autre type avant l'étape 7.

## 6. Risques

| Risque | Parade |
|---|---|
| Régression d'une scène à une couche (le cas de tous les jours) | Équivalence ancien format ↔ scène sur tous les presets, vue rouge ; fichier réel migré d'abord sur copie |
| Page OBS non rechargée face à un serveur qui diffuse des scènes | Une scène à une couche garde la forme historique ; une scène à plusieurs couches n'est pas comprise par une ancienne page, qui garde son fond (documenté, comme aux étapes 3 et 4) |
| Charge | Borne de 8 couches ; mesurée (étape 4) |
| Fichier d'état v4 illisible par un serveur plus ancien (type de couche inconnu) | Sauvegarde `pre-v4.bak` avant la première écriture ; retour arrière = la restaurer ; migration d'abord sur copie du fichier réel |
| `?branding=only` / `?branding=off` des Browser Sources existantes | Mêmes URL, même rendu : filtres sur le type `branding` (équivalence vue sur la page de rendu) |
| Coût de rendu des extensions de 6d (fusion, rotation, filtres sur des canvas pleine toile) | Mesure OBS avant exposition ; une extension trop coûteuse n'est pas proposée ou est bornée |
| Interactions de l'éditeur (glisser, aimanter, annuler) : régressions invisibles aux tests de logique | Logique pure testée à part ; interactions prouvées par pilotage réel du navigateur (souris, clavier) |
| Surfaces partagées (`scene-doc.js`, format d'état, `types.js`) | Vérification en aval avant chaque pas ; un commit par pas |
