---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Liaisons de couche (le son et les alertes pilotent une couche)

Statut : **livrée**. Suite de `couches-de-contenu.md` : les contenus (titre, forme, image) existent, il reste à les animer. Les effets réagissent
déjà au son et aux alertes **par eux-mêmes** ; une liaison fait réagir **n'importe quelle couche**, contenu compris, par des réglages du
Studio et sans code.

## 1. Le modèle

`Layer.bindings` : 4 liaisons au plus, chacune `{ source, target, from, to, durationMs }` (`layer-bindings.js`, module pur).

| Source | Famille | Effet |
|---|---|---|
| `audio`, `bass`, `mid`, `treble` | continue | la valeur suit le niveau sonore de 0 à 1, lissé sur `durationMs` |
| `event:follow`, `event:sub`, `event:raid`, `event:bits`, `event:any` | impulsion | à l'alerte la valeur saute à `to`, puis revient à `from` en `durationMs`, en ralentissant |

| Valeur pilotée | Bornes | Rôle |
|---|---|---|
| `opacity` | 0 à 1 | **remplace** l'opacité de la couche |
| `rotation` | −180° à 180° | **remplace** la rotation |
| `blur` | 0 à 12 px | **remplace** le flou |
| `scale` | 0,1 à 3 | s'**ajoute** (neutre : 1) |
| `x`, `y` | −100 % à 100 % de la couche | s'**ajoutent** (neutre : 0) |

Au repos (silence, aucune alerte), la valeur est **`from`** : une liaison ne change rien tant que sa source ne dit rien. « De » est donc la
valeur de repos et « À » celle de la source au maximum ; ils peuvent être inversés (une opacité qui chute à l'alerte).

**Limites devenues fonctions :**
- Une valeur ne peut être pilotée que par une liaison (validation) ; la liste de l'inspecteur ne propose plus une valeur déjà prise.
- Les bornes sont celles de la valeur : `canonicalSceneDoc` ramène « de » et « à » dedans, une durée dans 0 à 10 s ; une liste vide disparaît.
- Un lissage exponentiel n'atteint jamais sa cible : sous 1/10 000, la valeur la rejoint. Sans cela une couche liée au son resterait à réécrire
  à chaque image pendant des dizaines de secondes, sans différence visible. **Trouvé par l'essai de bout en bout** : une retombée d'alerte
  s'arrêtait sur un résidu de 0,0005 au lieu de 0.
- Un son qui n'arrive plus depuis une demi-seconde (micro coupé) vaut le silence, pas son dernier niveau.
- Le lissage se compte en temps, pas en images : même résultat à 30 et à 144 i/s.

## 2. Le moteur (`scene-runtime.js`)

- L'horloge de rendu n'est abonnée **que si** une couche visible montée a des liaisons ; elle se désabonne quand la dernière disparaît (masquage,
  retrait, destruction). Sans liaison, **aucun** coût.
- À chaque image, seules les couches liées sont évaluées ; **un style n'est écrit que s'il change** (une liaison au repos ne coûte aucune
  écriture).
- Les alertes arrivent par `react()` (le routage vers les effets ne change pas), le son par `applyAudio()`. Une liaison sonore **demande le
  micro** (`isAudioReactive`) même si l'effet de la couche ne gère pas le son.
- Des liaisons modifiées repartent de zéro (le niveau lissé d'une ancienne liaison n'a plus de sens).
- Les liaisons s'appliquent au calque de la couche, donc aux contenus comme aux effets, dans le Studio comme à l'antenne.

## 3. Le Studio

Section **Animation** de l'inspecteur (`dev/bindings-controller.js`) : « + Ajouter une liaison » crée une ligne de départ (le son pilote l'échelle
de 1 à 1,25) ; chaque ligne choisit la source, la valeur pilotée, « De (repos) », « À (source au maximum) » et le lissage ou la retombée ; « × »
la retire. Changer la valeur pilotée remet « de » et « à » à ses valeurs de départ (leurs bornes diffèrent) ; passer du son à une alerte remet la
durée de la famille. Une seule couche à la fois : sur plusieurs, la section le dit. Tout passe par les commandes de l'éditeur : annulable, enregistrable
en commande, résumé de publication (« liaisons : 0 → 2 »), copier-coller de style (les liaisons suivent), « Réinitialiser » les retire.
Le bouton « Tester une réaction » (Follow, Sub, Raid, Bits) déclenche la même voie que les vraies alertes.

## 4. Vérification

`layer-bindings.test.js` (modèle, validation, évaluation, édition), `scene-bindings-runtime.test.js` (horloge, alertes, son, styles, repos exact),
essai `25-liaisons.e2e.js` (alerte réelle envoyée au serveur et revenue par le canal d'événements : le titre paraît, retombe par paliers, reste
invisible pour une autre alerte ; annuler, rétablir, publier, recharger ; sélection multiple). 14 mutations vues rouges, dont deux ajoutées après
survivantes.

## 5. Reste

- Liaison à d'autres valeurs (couleur, rognage, taille du texte) et à d'autres sources (viewers, minuteur) : le modèle (`BINDING_TARGETS`,
  `BINDING_SOURCES`) les accueille sans changer le moteur.
- Courbes de réponse (au-delà du lissage et de la retombée) : sera repris avec la timeline.
- Vérifier dans OBS le comportement avec le vrai micro (voir `docs/inbox.md`).
