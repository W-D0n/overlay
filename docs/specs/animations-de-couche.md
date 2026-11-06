---
created: 2026-11-03
updated: 2026-11-06
---

# Spec — Animations de couche (entrée, boucle, sortie)

Statut : **en cours** — **livrée** (modèle pur `layer-animation.js` ; moteur : horloge par couche, entrée, boucle, sortie à date fixe, sortie au départ de la scène, relance par alerte couche par couche ; panneau « Entrée, boucle, sortie » de l'inspecteur ; préréglages de texte et de forme ; près de 200 défauts réinjectés tous vus rouges). Reste : la mesure dans OBS (procédure §17). Décision de l'owner du 2026-11-03 : une animation, de texte ou non, peut apparaître **n'importe quand** pour accompagner un
moment du live ; chaque couche a donc **sa propre horloge** (choix B), et la sortie se règle à **date fixe** et **au départ de la scène** (options 2 et 3).
Elle complète la timeline de scène (`timeline.md`), qui reste l'outil précis, image clé par image clé ; elle ne la remplace pas. Elle vaut pour **tous les types de couche**
(texte, image, forme, code, shader) : les préréglages agissent sur le calque de la couche.

## 1. Le modèle (`layer-animation.js`, pur)

`Layer.animation` (absent = aucune animation, la couche se comporte comme aujourd'hui) :

- `enter` : `{ preset, durationMs, delayMs?, ease? }` — joué une fois, quand l'horloge de la couche démarre.
- `loop` : `{ preset, periodMs, amount? }` — joué en continu une fois l'entrée finie (flottement, pulsation, balancement, clignotement, tremblement).
- `exit` : `{ preset, durationMs, afterMs?, onLeave? }` — `afterMs` : la sortie démarre à cet instant de l'horloge de la couche (**option 2**) ; `onLeave` : elle démarre quand la scène
  est remplacée (**option 3**). Les deux peuvent coexister : la première qui arrive joue, l'autre est sans effet.
- `restartOn` : les mêmes alertes que la relance de la timeline (`RESTART_SOURCES`), mais **pour cette seule couche** : c'est la relance par couche qui manquait à la timeline.

Une liste `restartOn` sans entrée, boucle ni sortie n'est pas écrite (rien à relancer).
Formes canoniques comme les autres modèles : bornes (durées 50 ms à 60 s), préréglage connu, pas de liste vide ni de doublon, objet vide non écrit.

## 2. L'horloge d'une couche

- Démarre à 0 quand la couche est **montée** (la scène arrive ou la couche est rendue visible) ; repart à 0 à une alerte de `restartOn`.
- Une couche à `exit.afterMs` reste **invisible** après sa sortie jusqu'à la relance ; sans relance, elle ne revient qu'à la prochaine arrivée de la scène.
- Une couche dont la sortie est finie sort de l'affichage (`display: none`) : elle ne coûte plus rien jusqu'à sa relance.
- Rien ne tourne pour une couche sans animation : l'horloge de rendu ne s'abonne que s'il existe une couche animée (comme pour les liaisons).

## 3. Composition avec la timeline et les liaisons

L'animation s'applique **par-dessus** les valeurs de base (réglage manuel, timeline, liaisons) : opacité et échelle se **multiplient**, décalages, rotation et flou s'**ajoutent**,
le masque de révélation se combine au rognage. Une couche peut donc avoir une timeline de scène et une entrée propre sans que l'une écrase l'autre.

## 4. Sortie au départ de la scène (option 3)

Quand une scène en remplace une autre, les couches sortantes qui ont `exit.onLeave` jouent leur sortie **avant d'être retirées** : la pile sortante est conservée jusqu'à la fin de la plus longue
sortie. Règle retenue : l'arrivée de la nouvelle scène commence tout de suite ; l'effet de transition de la pile sortante ne démarre qu'une fois les sorties jouées (sinon le fondu de la
pile masquerait la sortie de chaque couche). Mise en œuvre (`scene-runtime.js`, `startLeaving`) : chaque couche sortante note l'instant de son départ et **fige ses valeurs de base** (la timeline de la scène suivante repart de zéro et ne doit pas
les changer) ; la pile est retirée après `plus longue sortie + durée de la transition`. Une alerte ne relance pas une couche qui part ; une transition plus récente qui retire la pile annule la suite. Une scène remplacée sans transition (réglage en direct) ne joue pas de sortie : ce n'est pas un départ.

## 5. Préréglages

- **Toute couche** : fondu, glissement (4 sens), zoom, rebond, flou, rotation, révélation par masque (4 sens), glitch.
- **Contenu** (**faits**) : des préréglages qui agissent sur le contenu de la couche et non sur son calque. Texte : machine à écrire (lettre par lettre, d'un coup), lettre par lettre (en fondu, en montant), mot par mot
  (en fondu, en montant). Forme : tracé du contour (le contour se trace sur les 70 premiers pour cent, puis le remplissage apparaît en fondu). Chacun ne convient qu'à un type de couche
  (capacité `content` de `layer-kinds.js` : `text` ou `shape`) : le modèle refuse l'un d'eux sur un autre type, le panneau les grise, et changer le type d'une couche qui en utilise un est refusé avec une explication.
  Le calque reste au repos ; le modèle donne au composant une **présence du contenu** de 0 à 1 (`ContentState`, par `ComponentInstance.animate`), et la couche de texte dessine chaque unité à sa place dans la
  ligne entière (`text-layout.js` : `glyphUnits`, `glyphLook`) — un accent décomposé ou un emoji composé reste une seule unité, les espaces ne comptent pas. En sortie, le même préréglage joue à l'envers
  (la machine à écrire efface depuis la fin). Une durée de départ plus longue (1,5 s) est proposée : une phrase ne se lit pas en 600 ms. Preuves : `src/components/text-glyph.test.js`, `layer-animation-glyph.test.js`,
  et la suite e2e 37 qui lit l'encre réellement dessinée dans le canvas du texte.

## 6. Ordre de livraison

1. Modèle pur + validation + évaluation (`layer-animation.js`), intégré à `scene-doc.js`.
2. Moteur : horloge par couche, entrée, boucle, sortie à date fixe, relance par alerte.
3. Sortie au départ de la scène (option 3), avec essais de bout en bout sur la durée de conservation de la pile.
4. ~~Panneau du Studio~~ — **fait** (`studio/inspector/animation-controller.js`, essais `e2e/suites/37-animation-couche.e2e.js`) : un préréglage par phase (ou « Aucune »), durée, retard, courbe, période, amplitude, instant de sortie, case « Quand la scène part », cases d'alertes de relance, bouton « Rejouer » (le même que « recommencer » de la timeline : il rejoue aussi les couches). Modifier une animation la rejoue ; annuler et rétablir passent par l'historique de l'éditeur.
5. Préréglages de texte (glyphes).
5. ~~Préréglages de texte~~ — **fait** (§5).
6. ~~Formes : tracé du contour~~ — **fait** (§5, `src/components/ShapeLayer.js`, `shape-geometry.js` : `pathLength`, `traceParts` ; pointillé du contour pour la part tracée, essais e2e qui lisent l'encre du canvas).

## 7. Limites assumées

- Les préréglages sont **fixes** (pas de courbe de Bézier) ; pour un mouvement sur mesure, la timeline ou la couche Code restent là.
- Une animation ne pilote pas les réglages d'une couche Code ou Shader : ce rôle est celui des liaisons et de la timeline (`couche-code.md` §9).
- Le coût est celui d'un style de calque par image tant qu'une boucle tourne ; à mesurer dans OBS (procédure à ajouter à l'arrivée du moteur).
