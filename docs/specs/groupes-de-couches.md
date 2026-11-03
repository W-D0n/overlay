---
created: 2026-11-03
updated: 2026-11-03
---

# Spec — Groupes de couches

Statut : **décidée, en cours** (phase 1 livrée : le modèle pur, 44 défauts réinjectés tous vus rouges). Décision de l'owner du 2026-11-03 : « groupes complets », pas un simple dossier. Un groupe se comporte comme **une couche** : il a son opacité, sa fusion,
sa rotation, son flou, ses filtres, sa timeline, ses liaisons et ses animations d'entrée, de boucle et de sortie, appliqués **à l'ensemble** de ses couches, rendues ensemble.

## 1. Le modèle

- **Un groupe est une entrée de la liste de couches** (`SceneDoc.layers`, liste plate du fond vers l'avant) de type `group` : `{ id, kind: 'group', name?, visible, locked?, opacity, placement, options: {}, … }`,
  avec les mêmes champs de rendu qu'une couche (`blend`, `rotation`, `crop`, `blur`, `filters`, `bindings`, `timeline`, `animation`). Il n'a pas de réglages (`options` reste un objet vide).
- **Ses couches portent `group: '<identifiant du groupe>'`.** Le bloc d'un groupe est **contigu** dans la liste : ses couches, du fond vers l'avant, puis **l'entrée du groupe juste après la dernière**. Lu depuis l'avant
  (comme le panneau des couches), le groupe vient donc en tête de ses couches. Réordonner un groupe déplace son bloc entier.
- **Un seul niveau** : un groupe ne contient pas de groupe, et une couche d'identité (le branding) ne se groupe pas.
- **Bornes** : 8 couches hors groupes au plus (la garde de charge ne change pas : un groupe ne dessine rien), 4 groupes au plus, **au moins une couche par groupe** (un groupe vide est invalide : l'éditeur
  le dissout dès que sa dernière couche part).
- **Le placement d'un groupe est dérivé** : la boîte englobante des placements de ses couches, recalculée à chaque forme canonique (jamais saisie). Les couches gardent des placements en **fractions de la scène**,
  comme aujourd'hui : grouper ne déplace rien, un document sans groupe se rend à l'identique. Le placement d'un groupe sert de repère : l'origine de ses rotations et de ses échelles est le **centre de cette boîte**.
- **Compatibilité** : le format ne change pas de version (`version: 1`) ; un champ `group` et un type `group` en plus. Une scène avec groupe n'a pas de forme « preset historique » (`currentFromScene` rend `null`).

## 2. Le rendu

- Le moteur monte un **calque de groupe** (plein cadre) qui contient les calques de ses couches ; le style de rendu du groupe (opacité, fusion, rotation, flou, filtres, transformation par timeline ou
  liaison, animation de couche) s'applique à ce calque, donc **à l'ensemble composé** : l'opacité d'un groupe n'est pas l'opacité de chaque couche, le flou floute le tout, la fusion mélange le tout.
- `transform-origin` du calque de groupe = centre de sa boîte englobante. Un groupe masqué (`visible: false`) masque ses couches sans changer leurs réglages ; une couche masquée dans un groupe visible ne se monte pas
  (comme aujourd'hui). Les couches d'un groupe reçoivent le son et les alertes comme les autres (le routage lit la table plate des couches montées).
- L'horloge de couche (`layer-animation.js`) et la timeline s'appliquent au groupe comme à une couche. Une sortie « au départ de la scène » d'un groupe est jouée avec celles de ses couches.

## 3. L'édition

- **Grouper / dégrouper** : `Ctrl+G` groupe les couches sélectionnées (elles se rassemblent à l'endroit de la plus haute), `Ctrl+Maj+G` dégroupe. Une seule entrée d'historique.
- **Déplacer / redimensionner un groupe** sur le canevas ou par les champs de placement de l'inspecteur : l'éditeur **recalcule le placement de chaque couche** (translation, mise à l'échelle autour de la boîte), en une entrée
  d'historique ; le placement du groupe suit. Aligner et répartir traitent un groupe comme sa boîte.
- **Supprimer** un groupe supprime ses couches ; **dupliquer** copie le bloc avec de nouveaux identifiants ; **masquer** et **verrouiller** un groupe agissent sur ses couches ; une couche d'un groupe verrouillé est
  verrouillée. Retirer la dernière couche d'un groupe dissout le groupe. **Ajouter une couche** avec une couche d'un groupe sélectionnée l'ajoute au groupe ; avec un groupe sélectionné, au-dessus du groupe.
- **Panneau des couches** : le groupe est une ligne en tête de ses couches, repliable, ses couches en retrait ; on glisse une couche dans un groupe ou hors d'un groupe ; le groupe se renomme comme une couche.
- **Inspecteur, timeline, liaisons, animation, filtres** : un groupe sélectionné se règle exactement comme une couche (mêmes sections), sauf le type et les réglages d'effet (aucun).
- La galerie « Ajouter une couche » ne propose pas le type `group` : un groupe naît de « Grouper ».

## 4. Phases (un commit chacune, essais complets verts avant le commit)

1. ~~**Modèle pur**~~ — **fait** (`layer-group.js`, `layer-kinds.js`, `scene-doc.js`, `components/GroupLayer.js`) : type `group`, champ `group`, validation du bloc contigu, bornes, placement dérivé en forme canonique, aides de structure
   (couches d'un groupe, bloc, entrées de premier niveau, grouper, dégrouper). Tests et défauts réinjectés.
2. **Moteur** (`scene-runtime.js`) : calques de groupe imbriqués, rendu du groupe, origine de transformation, masquage, routage, animation et sortie au départ. Tests avec monde factice.
3. **Éditeur** (`dev/scene-editor.js`) : grouper, dégrouper, supprimer, dupliquer, déplacer, verrouiller, ajouter, placement d'un groupe par ses couches, historique. Tests et défauts réinjectés.
4. **Panneau, canevas, inspecteur** : arbre repliable, glisser-déposer, `Ctrl+G`, poignées sur la boîte du groupe, champs de placement ; essais de bout en bout dans le vrai Studio.
5. **Finitions** : récapitulatif de publication, presse-papiers, vignettes, import et export, guide, procédure d'essai dans OBS.

## 5. Limites assumées

- Un seul niveau d'imbrication ; pas de groupe dans un groupe.
- Les animations de contenu (texte, tracé) ne s'appliquent qu'aux couches, pas au groupe ; l'animation de calque s'applique aux deux.
- Le coût de rendu d'un groupe est celui de ses couches plus un calque : un groupe à filtre ou à opacité force un rendu hors écran par image ; à mesurer dans OBS (procédure à ajouter en phase 5).
