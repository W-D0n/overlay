---
created: 2026-10-31
updated: 2026-10-31
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
- Les valeurs animées et leurs bornes sont **celles des liaisons** (`layer-bindings.js`) : opacité, rotation, flou, échelle, décalages. Une même
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

## 3. Le Studio (`dev/timeline-controller.js`, `dev/timeline-view.js`)

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
boucle, pause, position, priorité des liaisons, arrivée de scène), `dev/timeline-view.test.js` ; essai `29-timeline.e2e.js` (clés réelles, glisser à la souris,
flèches, courbes, deux pistes, durée, boucle, lecture, publication, **page de rendu d'OBS**). 15 mutations du modèle et du moteur, 10 de l'interface vues
rouges (certaines survivantes ont fait ajouter des tests).

## 5. Reste

- **Déclencher la timeline par une alerte** (une entrée qui rejoue l'animation à chaque raid) : aujourd'hui elle joue à l'arrivée de la scène ; une liaison
  peut déjà réagir à une alerte, mais pas relancer le scénario.
- Plusieurs couches vues en même temps dans le panneau ; copier-coller des images clés ; édition de la courbe (Bézier).
- Valeurs animées autres que celles des liaisons (couleur, rognage, taille du texte).
- Vérifier la fluidité dans OBS (`docs/inbox.md`).
