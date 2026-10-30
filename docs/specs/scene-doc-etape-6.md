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

## 3. Découpage

| Pas | Contenu | Visible ? |
|---|---|---|
| **6a-0 — Le branding devient une couche** (D3) | Nouveau type de couche `branding` (monté par `BrandingLayer`, contenu lu sur le canal global existant) ; migration du fichier d'état en **version 4** avec sauvegarde `pre-v4.bak` : une scène qui affichait le branding (`showBranding` absent ou vrai) reçoit une couche `branding` en tête, pleine toile, et perd `showBranding`. `?branding=only` et `?branding=off` de la page de rendu deviennent des filtres sur ce type de couche. | Non |
| **6a — Modèle de bout en bout** | Le serveur lit, écrit, diffuse, historise et met en brouillon des scènes (une ou plusieurs couches). L'API et les canaux portent des scènes ; une scène à une couche garde la forme historique pour les pages OBS non rechargées. Le Studio, les vignettes et la page de rendu lisent des scènes. | Non (aucun changement d'écran) |
| **6b — État d'édition et liste de couches** | Un état d'édition unique (la scène brouillon, avec abonnement, sélection, annulation/rétablissement) ; panneau de liste : ajouter un effet, supprimer, dupliquer, réordonner, masquer, verrouiller, renommer ; borne de 8 couches. | Oui |
| **6c — Propriétés de couche** | Formulaire généré par schéma (existant) appliqué à la couche sélectionnée ; opacité ; placement en champs numériques (en fractions du canvas, affichées en %). | Oui |
| **6d — Placement à la souris** | Poignées de déplacement et de redimensionnement sur l'aperçu, aimantation, couche verrouillée intouchable. | Oui |
| **6e — Presets et publication** | Presets = scènes (vocabulaire de l'interface, import/export en version 3), historique et brouillons par scène, vignettes de scène. | Oui |

Chaque pas se livre en commits séparés, `bun test` vert, preuve en navigateur ; 6a est gardé par les tests d'intégration existants et
par une équivalence pour les scènes à une couche.

## 4. Décisions à valider

1. **D1 — Vocabulaire** : l'interface dit « preset » aujourd'hui. *Proposé* : « scène » à partir de 6e (pas avant : l'éditeur de
   couches n'apparaît qu'en 6b).
2. **D2 — Placement : tranché par l'owner (2026-10-30)** : champs numériques en 6c (position et taille en % du canvas), puis la souris
   en 6d. Le champ numérique est testable et utile à lui seul.
3. **D3 — Branding : tranché par l'owner (2026-10-30)** : le branding **devient une couche de scène** ; son **texte reste global**
   (réglé une fois dans le panneau Branding, diffusé sur son canal comme aujourd'hui), le **placement, l'opacité et la visibilité sont par
   scène**. Aucune migration du contenu : seul le fichier d'état change de version (6a-0). Un preset qui masquait le branding
   (`showBranding: false`) n'a simplement pas de couche `branding`. Pour une scène « un effet + branding pleine toile » (le cas
   d'aujourd'hui), la forme historique reste projetable (`component`, `options`, `showBranding`) pour les pages non rechargées.
4. **D4 — Types de couches proposés par l'éditeur** : les 11 effets existants et le branding (`layer-kinds.js`), aucun autre type avant l'étape 7.

## 5. Risques

| Risque | Parade |
|---|---|
| Régression d'une scène à une couche (le cas de tous les jours) | Équivalence ancien format ↔ scène sur tous les presets, vue rouge ; fichier réel migré d'abord sur copie |
| Page OBS non rechargée face à un serveur qui diffuse des scènes | Une scène à une couche garde la forme historique ; une scène à plusieurs couches n'est pas comprise par une ancienne page, qui garde son fond (documenté, comme aux étapes 3 et 4) |
| Charge | Borne de 8 couches ; mesurée (étape 4) |
| Fichier d'état v4 illisible par un serveur plus ancien (type de couche inconnu) | Sauvegarde `pre-v4.bak` avant la première écriture ; retour arrière = la restaurer ; migration d'abord sur copie du fichier réel |
| `?branding=only` / `?branding=off` des Browser Sources existantes | Mêmes URL, même rendu : filtres sur le type `branding` (équivalence vue sur la page de rendu) |
| Surfaces partagées (`scene-doc.js`, format d'état, `types.js`) | Vérification en aval avant chaque pas ; un commit par pas |
