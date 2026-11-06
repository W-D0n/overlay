---
created: 2026-10-31
updated: 2026-11-06
---

# Spec — Timeline à images clés

Statut : **livrée** (première version complète). C'était l'objectif final du cadrage (`studio-cadrage.md` : « Éditeur, objectif final : timeline à
images clés ») et la raison d'être des **chemins adressables** de `scene-doc.js`. Une scène ne se contente plus d'être posée : elle **joue**.

## 1. Le modèle (`layer-timeline.js`, pur)

- Une couche porte des **pistes** (`Layer.timeline`, 6 au plus : une par valeur animée) ; chaque piste est une suite d'**images clés**
  `{ t, v, ease }` (24 au plus, strictement croissantes dans le temps). La courbe d'une clé décrit le trajet **vers la clé suivante** :
  `linear`, `easeIn`, `easeOut`, `easeInOut`, ou `hold` (palier : la valeur saute à la clé suivante).
- La scène porte sa **durée** (0,5 à 60 s) et son **mode** (`once` : s'arrête à la dernière image ; `loop` : recommence) : `SceneDoc.timeline`. Absente, la
  scène a la timeline par défaut : 4 s (ou la dernière clé si elle est plus tardive), une seule fois.
- **Courbe de Bézier** (2026-11-03) : la courbe d'une image clé peut être « personnalisée » : `Keyframe.bezier = [x1, y1, x2, y2]` (`cubic-bezier.js`), la même que `cubic-bezier()` de CSS, de (0, 0) à (1, 1).
  Les abscisses restent dans 0 à 1 (le temps entre deux images clés), les ordonnées vont de -2 à 3 : au-delà de 0 à 1, la valeur **dépasse** (rebond) ou **recule** (anticipation). Elle n'existe que pour la courbe `bezier`
  (validation : exigée avec elle, refusée avec les autres ; forme canonique : arrondie au millième, bornée, retirée des autres courbes). Choisir « Courbe personnalisée » part de la courbe douce de CSS ; régler la courbe
  choisit « personnalisée » ; choisir une autre courbe l'efface. Elle suit l'image clé quand on la déplace, se copie et se colle avec elle. Six préréglages (douce, freine fort, démarre fort, dépasse, recule puis part,
  recule-dépasse-se pose). Dans le panneau : le détail d'une image clé dessine sa courbe (toutes les courbes), et pour une courbe personnalisée montre deux poignées qu'on glisse à la souris (flèches du clavier : 0,05 ;
  `Maj` : 0,01), les quatre nombres et la liste des préréglages (`studio/layers/curve-editor.js`). Les entrées et sorties d'animation de couche gardent leurs courbes fixes. Preuves : `cubic-bezier.test.js` (calcul vérifié contre un
  balayage indépendant), `layer-timeline-bezier.test.js`, `e2e/suites/39-courbe-personnalisee.e2e.js` (valeur lue sur le calque réel, poignée à la souris et au clavier ; défauts réinjectés vus rouges).
- **Copier-coller d'images clés** (2026-11-03) : `copyKeys(tracks, target, indexes?)` copie une image clé ou toute une piste (instants relatifs à la première) ; `pasteKeys(tracks, clip, at, range)` les pose
  à l'instant voulu, sur la même valeur, d'une couche ou d'une autre. Une image déjà posée à un instant collé est remplacée (valeur et courbe de la copie), les autres restent ; les instants sont arrondis et ramenés dans la
  durée possible, les valeurs dans les bornes ; **tout ou rien** si la piste dépasserait 24 images ou si 6 pistes existent déjà. Dans le panneau : ⧉ sur une piste la copie, « Copier » dans le détail copie l'image choisie,
  « Coller » la pose au repère de lecture (la copie survit au changement de couche ; une couche qui n'a pas la valeur copiée, par exemple un réglage de code, refuse en le disant), `Ctrl+C` et `Ctrl+V` sur une image clé.
  Collage = une entrée d'historique. Preuves : `layer-timeline-clip.test.js` (14 défauts réinjectés vus rouges) et `e2e/suites/38-copier-coller-cles.e2e.js` (11 défauts de l'interface vus rouges).
- **Relance par une alerte** (2026-11-02) : `SceneDoc.timeline.restartOn` liste les sources d'alerte (`event:any`, `event:follow`, `event:sub`, `event:raid`, `event:bits` : les
  impulsions des liaisons) qui **ramènent la lecture à zéro et la remettent en marche** quand elles arrivent, même arrêtée à sa fin ou mise en pause : « un raid rejoue l'entrée du titre ».
  `event:any` les relance toutes, `event:<type>` celles de ce type ; une liste vide n'est pas écrite (forme canonique, ordre des sources, sans doublon). Le moteur
  (`scene-runtime.js`, `react`) la lit à chaque alerte ; le panneau de la timeline propose une case par alerte. Elle vaut pour toute la scène (la durée est celle de la scène),
  donc pour les valeurs animées des couches Code et Shader comme pour les autres. Preuves : `layer-timeline-restart.test.js` (19 mutations, 18 vues rouges, 1 équivalente retirée du code)
  et `e2e/suites/36-timeline-alerte.e2e.js` (de vraies alertes par le serveur : choisie → relance, autre → rien, « toute alerte », annulation).
- Les valeurs animées et leurs bornes sont **celles des liaisons** (`layer-bindings.js`) : opacité, rotation, flou, échelle, décalages, et les réglages numériques bornés d'une
  couche Code (`param:<clé>`, `specs/couche-code.md` §9). Une même
  valeur se règle donc dans le temps (timeline) ou par le son et les alertes (liaison) ; **quand les deux visent la même valeur, la liaison
  l'emporte** (la réaction en direct passe devant le scénario).
- Avant la première clé, la valeur de la première ; après la dernière, celle de la dernière ; entre deux clés, l'interpolation par la courbe de la
  clé de départ.

**Limites devenues fonctions :** valeurs bornées par leur cible et temps arrondis à la milliseconde par la forme canonique ; clés triées ; une piste
vidée disparaît ; deux clés ne se superposent jamais (refusé, avec la raison) ; une scène animée n'a **pas de forme historique plate** (`currentFromScene`
la refuse) : l'animation ne se perd jamais en silence dans la projection `{ component, options }`.

## 2. Le moteur (`scene-runtime.js`)

- Le temps de la timeline est le **temps écoulé depuis l'arrivée de la scène** (nouvelle pile, transition ou remontage), cumulé image par image par
  l'horloge de rendu (dont le saut maximal est borné : une page cachée puis revue ne fait pas sauter l'animation). Un réglage de la scène en place
  (une couche modifiée) **ne recommence rien**.
- L'horloge n'est abonnée que s'il existe une liaison ou une image clé à évaluer ; les styles ne sont écrits que s'ils changent.
- `runtime.timeline` : `state()`, `play()`, `pause()`, `restart()`, `seek(ms)` (qui met en pause : on regarde cette image), `subscribe()`. La page de rendu
  d'OBS ne s'en sert pas : l'animation joue seule, depuis l'arrivée de la scène. **Vérifié sur la vraie page `background.html`** (l'essai relève l'opacité
  du texte image par image).

## 3. Le Studio (`studio/layers/timeline-controller.js`, `studio/layers/timeline-view.js`)

Un panneau **sous l'aperçu** : lecture (▶ / ⏸), revenir au début, curseur de position, durée, boucle, puis, dépliées, les **pistes de la couche sélectionnée**.

- **+ Image clé** pose une clé au repère de lecture sur la valeur choisie, avec **la valeur que la couche y a déjà** : en poser une ne change rien tant qu'on
  ne la règle pas.
- Une clé est un **losange** : on la **glisse** (l'aperçu se place sur son instant, un glisser entier est un seul pas d'historique), on la déplace aux **flèches**
  (10 ms, `Maj` : 100 ms), on la **règle** (instant exact, valeur, courbe) ou on la **supprime** ; supprimer la dernière clé d'une piste retire la piste. Un clic
  dans le vide d'une piste place le repère.
- Se placer dans le temps **met en pause** et l'aperçu montre cette image : modifier une clé s'y voit aussitôt.
- Tout passe par les commandes de l'éditeur : annulable, publiable (la page de rendu l'anime), enregistrable en commande, résumé de publication
  (« animation : 0 → 2 images clés »), copier-coller de style, versions de scène, « Réinitialiser » retire l'animation.
- Accessibilité : chaque clé est un bouton qui se décrit (« Image clé opacité à 1,00 s, valeur 1 »), les pistes sont des groupes nommés, le panneau suit le
  parcours au clavier (essai `20-parcours-clavier`).

## 4. Vérification

`layer-timeline.test.js` (modèle, courbes, validation, forme canonique, édition, document de scène), `scene-bindings-runtime.test.js` (moteur : lecture,
boucle, pause, position, priorité des liaisons, arrivée de scène), `studio/layers/timeline-view.test.js` ; essai `29-timeline.e2e.js` (clés réelles, glisser à la souris,
flèches, courbes, deux pistes, durée, boucle, lecture, publication, **page de rendu d'OBS**). 15 mutations du modèle et du moteur, 10 de l'interface vues
rouges (certaines survivantes ont fait ajouter des tests).

## 5. Reste

- **Une relance par couche** : `restartOn` vaut pour la scène entière. Faire rejouer l'entrée d'un seul titre pendant qu'un autre continue demande une horloge par couche
  (ou des groupes de couches).
- Plusieurs couches vues en même temps dans le panneau ; copier-coller des images clés ; édition de la courbe (Bézier).
- Valeurs animées autres que celles des liaisons (couleur, rognage, taille du texte).
- Vérifier la fluidité dans OBS (`docs/inbox.md`).
