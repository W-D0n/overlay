---
created: 2026-10-29
updated: 2026-10-30
---

# Spec — Document de scène et moteur de scène (étape 4)

Statut : **validée le 2026-10-30** (D1, D2, D4 comme proposé ; D3 modifié : placement en fractions, voir plus bas). Étape 4 de `docs/architecture-review.md` §5, après le
socle de rendu (étapes 1-2) et la définition unique d'un type de couche (étape 3), toutes livrées. Elle
touche des **surfaces partagées** (`dev/background-state-format.js`, `background-mount.js`, `types.js`) et
**le fichier d'état de l'owner** : migration réversible avec sauvegarde, comme l'étape 3.

Vocabulaire (`codebase-design`) : module, interface, seam. « Scène » = ce que `docs/specs/studio-cadrage.md`
appelle une scène en couches : une pile ordonnée de couches rendue par une seule page. Un « preset »
d'aujourd'hui est une scène à **une** couche.

## Problème (constats mesurés, `architecture-review.md` F2, F6, §4.1)

1. **Le modèle ne sait pas dire « plusieurs couches ».** Un état est `{ component, options, transition?,
   showBranding? }` : un seul effet. Le cadrage du Studio (scènes en couches, éditeur de couches, décor,
   médias, widgets) n'a aucun support dans le format ni dans le rendu.
2. **Le montage fait trois métiers** (`background-mount.js`) : cycle de vie d'un effet, transition entre deux
   effets, routage audio et réactions. Pour N couches, ces trois métiers doivent s'appliquer par couche et
   par scène : le montage actuel ne s'étend pas, il se remplace.
3. **Les propriétés ne sont pas adressables.** La future timeline doit pouvoir viser « l'opacité de la couche
   `fond`, à t = 4 s ». Aujourd'hui une option est une clé dans un objet plat, sans chemin ni identité de couche.

## Conception

### 4.1 `SceneDoc` : un document pur, versionné

```text
SceneDoc  = { version: 1, id, name, tags?, transition?, showBranding?, layers: Layer[] }
Layer     = { id, kind: LayerKindId, name?, visible, opacity, placement, options }
placement = { x, y, width, height }      // fractions du canvas, de 0 à 1
```

- `layers` est ordonné **du fond vers l'avant** ; `id` est stable (renommer, réordonner ou supprimer une
  couche ne change pas l'identité des autres). Bornes : 1 à 8 couches (garde de charge, voir Risques).
- `kind`, `options` : exactement ceux de l'étape 3 (`layer-kinds.js`) ; `validateOptions` / `clampOptions`
  s'appliquent **par couche**.
- `placement` par défaut = tout le canvas `{ x: 0, y: 0, width: 1, height: 1 }`. **Fractions, pas pixels** :
  un document reste valable quelle que soit la résolution de la source OBS (aujourd'hui 1920×1080, le 1440p
  reste possible : `render-reference.js` est le seul endroit qui la nomme). Les effets dimensionnent déjà leur
  canvas sur leur conteneur (`defineCanvasLayer`) : une couche placée ailleurs n'exige aucun changement d'effet.
- `enter` / `exit` par couche (cadrage) sont **réservés, non implémentés** : le format les tolère
  (champ inconnu conservé), leur contenu viendra avec la timeline.
- **Propriétés adressables** : un chemin `layers[<id>].options.speed` / `layers[<id>].opacity`, avec deux
  fonctions pures `readPath(doc, path)` et `writePath(doc, path, value)` (renvoient un nouveau document).
  C'est la seule interface dont la timeline aura besoin ; elle est testée dès cette étape.

Module : `scene-doc.js` (racine, comme `layer-kinds.js`), **pur, sans DOM**. Interface : `createSceneDoc`,
`validateSceneDoc`, `canonicalSceneDoc`, `readPath`, `writePath`, `sceneFromPreset`.

### 4.2 Un preset est une scène à une couche

```text
preset  { id, name, component, options, tags?, transition?, showBranding? }
   ⇒    scène { version:1, id, name, tags?, transition?, showBranding?,
                layers:[{ id:'main', kind: component, visible:true, opacity:1,
                          placement: plein canvas, options }] }
```

- Fichier d'état **version 3** : `presets` devient `scenes` ; `current` devient une scène (la scène en
  antenne). La migration 2 → 3 est explicite (la 1 → 2 existante reste), avec sauvegarde
  `background-state.json.pre-v3.bak` et **lecteur tolérant** : un fichier version 2 et les lots d'export
  version 1 et 2 continuent de se lire et de s'importer.
- Les URL ne changent pas : `?preset=<id>` reste valide (l'identifiant d'une scène migrée est celui de son
  preset). `?scene=<id>` est accepté comme synonyme, sans effet de plus. Aucune Browser Source à modifier.
- Le Studio n'a **aucune modification visible** dans cette étape : l'éditeur de couches est l'étape 6. Il lit
  et écrit des scènes à une couche à travers `sceneFromPreset` et son inverse.

### 4.3 `createSceneRuntime` : un module profond, à la place du montage

`createSceneRuntime(container, deps)` : `apply(scene, { transition })`, `emit(event)`, `setPaused`, `destroy`.
Ce qu'il cache :

- **Réconciliation des couches** par `id` : même `id` et même `kind` → `update(options)`, jamais de
  recréation ; nouvelle couche → montage ; couche retirée → démontage ; ordre → `z-index`. `visible` et
  `opacity` sont appliqués sur le calque de la couche, sans toucher à l'effet.
- **Transition de scène** : la scène entrante et la sortante sont deux **calques de scène** superposés
  pendant l'animation (fondu / balayage existants, `background-transition.js` généralisé de « un effet » à
  « une scène »). Une scène porteuse d'une `transition` est une arrivée ; sans elle, c'est un réglage.
- **Routage selon les capacités déclarées** (étape 3) : l'audio alimente toute couche `audio: true` et
  visible ; une réaction est traitée par une couche `reactions: 'native'` si elle existe, sinon dessinée
  **une seule fois** par la surcouche partagée, quel que soit le nombre de couches.
- Une couche qui lève une erreur n'arrête ni la scène ni l'horloge (isolement déjà assuré par `render-clock.js`).

`background-mount.js` disparaît (ou se réduit à un adaptateur d'une ligne le temps du basculement) ; ses tests
sont repris sur le moteur, pas supprimés.

### 4.4 Branding : hors de cette étape

Le branding reste une surcouche globale (état séparé, `showBranding` par scène). Le passer en type de couche
(cadrage : « branding existe déjà comme type ») est une décision séparée, voir D1.

## Ordre de livraison (un commit par pas, `bun test` vert à chaque pas)

1. **4a** `scene-doc.js` : formes, validation, canonicalisation, `readPath` / `writePath`, `sceneFromPreset`.
   Tests dont un **rouge d'abord** par propriété (chemin inexistant, id dupliqué, 9 couches, type invalide).
2. **4b — livré** : format d'état version 3 + migration 2 → 3 (et sans version → 3) + sauvegarde `pre-v3.bak`, à la frontière
   lecture/écriture du serveur ; l'API (`/state`, `/save-preset`, import, WebSocket) garde sa forme `current` / `presets`, donc une
   page OBS non rafraîchie ne voit rien. **Écart assumé** : les lots d'export restent des presets (version 2) ; une version 3 de
   lot n'aurait que le même contenu sous un autre nom tant qu'une scène ne peut avoir qu'une couche, elle arrive avec 4d/étape 6. **Vérifié sur une copie** de votre fichier réel avant tout contact avec l'original ;
   aller-retour export → import des lots version 1, 2 et 3.
3. **4c — livré** : `scene-runtime.js` (`createSceneRuntime` : `apply`, `layers`, `destroy`) — réconciliation par `id`,
   z-order par `z-index` sans déplacer de nœud, placement en pourcentages, visibilité, opacité ; une couche en panne est
   signalée sans arrêter les autres. 13 tests sur registre factice (4 mutations vues rouges) et preuve en navigateur avec
   les vrais effets : trois couches (dotgrid, fireflies, pluie placée en coin) à 1080p et 1440p, coin à 1344×54 puis
   1792×72 px (= 70 % / 5 %), canvas non vides, masquer puis remontrer la couche du milieu ne recrée aucun canvas.
   Le masquage laisse l'effet tourner (spec) : son coût reste à mesurer dans OBS.
   **Mesure de charge indicative** (Chrome sans interface, 1080p, capacité libre du fil principal en messages/s, médiane de
   3 passes ; sans couche 296 000) : 1 couche 100 000, 3 couches 86 500, 8 couches 62 000. Une couche de plus coûte peu devant
   la première ; hypothèse : la borne de 8 tient. Ce n'est pas le CPU d'OBS (CEF) : votre protocole habituel reste le critère
   avant l'éditeur multi-couches.
4. **4d — livré** : le moteur reprend du montage d'un effet seul les transitions (arrivée = scène porteuse d'une `transition`,
   superposée à l'ancienne puis retirée), la pause, la notification, le routage audio et réactions par capacités ; `background.html`,
   l'aperçu du Studio et les vignettes montent par `createSceneRuntime` + `sceneFromCurrent` ; `background-mount.js` est retiré.
   Les 28 tests de l'ancien montage sont repris tels quels sur le moteur (26 sans modification, 2 dont seul l'ordre d'insertion
   des calques change). **Sonde d'équivalence** (navigateur, horloge pilotée à la main, graine aléatoire fixe, 45 images) : les
   11 types de couche et les 5 presets intégrés produisent un DOM et des pixels identiques entre l'ancien montage et le
   moteur, à 1920×1080 et 2560×1440 (16 cas sur 16 ; régression réinjectée détectée 16 fois sur 16). Comportement conservé :
   un état qu'aucune couche ne peut afficher (effet inconnu) laisse le fond en place.
5. **4e** Routage audio et réactions par capacités ; test de contrat : une scène à trois couches reçoit
   **un seul** dessin de réaction.
6. **4f** `?scene=` (synonyme), documentation, `CLAUDE.md` (surfaces partagées : `scene-doc.js`).

## Critères de succès (chacun observé, pas déduit)

- Votre `background-state.json` réel, migré en copie : mêmes presets, mêmes options, même scène courante
  (chaque preset = une scène d'une couche) ; le fichier migré est valide et se relit.
- Pour chaque effet : équivalence de rendu ancien montage ↔ moteur sur une scène à une couche (sonde).
- Une scène de **trois couches** (par exemple DotGrid + Fireflies + une couche placée dans un coin) s'affiche
  dans l'aperçu et dans la page de rendu, à 1080p et à 1440p ; masquer une couche la retire sans recréer les autres.
- Mesure de charge (FPS du compteur et CPU OBS, votre protocole habituel) avec 1 couche puis 3 couches :
  **résultat publié avant d'ouvrir l'éditeur multi-couches** (étape 6). Page de mesure : `dev/charge.html?couches=N`
  (0 à 8, N couches pleine taille aux réglages par défaut, `&types=dotgrid,rain,…` pour choisir, `&hud=0` pour masquer le
  compteur), à charger dans une Browser Source de test 1920×1080 à 60 fps ; relever dans le dock Statistiques d'OBS le CPU,
  le temps de rendu moyen, les images manquées et abandonnées, sur 2 minutes par configuration (0, 1, 3, puis 8 couches).
  **Mesure de l'owner dans OBS (2026-10-30)**, Browser Source 60 fps, observation à l'œil sans médiane (valeurs approximatives) :

  | Couches | FPS OBS | CPU (dock Statistiques) | Temps de rendu moyen | Images manquées |
  |---|---|---|---|---|
  | 0 | 60 | 0,2 à 0,5 % | 0,3 à 0,4 ms | 1 / 399 800 |
  | 1 | 60 | 0,71 à 1 % | 0,7 ms | 0 / 16 000 |
  | 3 | 60 | 0,7 % | 0,8 ms | 0 / 10 800 |
  | 8 | 60 | 0,44 à 0,83 % | 0,8 ms | 0 / 6 800 |

  Lecture : la première couche coûte (0,3 → 0,7 ms) ; les suivantes ne se distinguent pas du bruit (CPU de 8 couches dans
  la fourchette de 1 couche, aucune image manquée). Aucun signe contraire à la borne de 8. Réserve : le dock Statistiques
  mesure le processus OBS ; hypothèse, la page de la Browser Source tourne dans un sous-processus (`obs-browser-page.exe`)
  que ce CPU peut ne pas inclure. Complément à relever : CPU et GPU de ce sous-processus au Gestionnaire des tâches pour 0, 3 et 8 couches.
- Changement de scène à transition : aucun empilement, une seule scène à la fin (cas déjà au QA, case 5).
- Une page OBS **non rafraîchie** après la bascule du fichier continue d'afficher le fond ou, au pire, garde
  son dernier état sans erreur ; rafraîchie, elle lit la version 3.
- `bun test` vert ; typage : aucune régression.

## Hors périmètre

Éditeur de couches et UI multi-couches (étape 6) ; brouillon / publication côté serveur et décomposition du
serveur (étape 5) ; nouveaux types de couches (décor, médias, widgets : étape 7) ; timeline (étape 8) ;
branding en couche (D1) ; renommage `background.html` → `render.html` (décision D2 de la revue, indépendante).

## Risques

| Risque | Parade |
|---|---|
| Fichier d'état corrompu par la migration | Sauvegarde `pre-v3.bak` avant écriture ; migration d'abord sur copie ; lecteur tolérant ; tag `pre-scene-doc` posé avant 4b |
| Régression visuelle au remplacement du montage | Sonde d'équivalence par effet (rouge vu) + contrôle visuel de l'owner sur ses presets, comme à l'étape 2 |
| Charge : N couches = N canvas pleine taille | Borne à 8 couches ; mesure à 1 et 3 couches **avant** l'étape 6 ; une couche masquée ne coûte rien (démontée ou en pause, à trancher à la mesure) |
| Page OBS non rafraîchie face à un serveur migré | Lecteur tolérant et rendu inchangé pour une scène à une couche ; documenté comme pour l'étape 3 |
| Surfaces partagées (`types.js`, format d'état) | Vérification en aval avant chaque pas ; un commit par pas |

## Décisions à prendre

1. **D1 — Branding : surcouche globale (proposé) ou type de couche dès maintenant ?** Recommandation : rester
   global dans cette étape. Le passer en couche demande de décider si le branding est par scène ou commun, ce
   qui est une décision produit (aujourd'hui : commun, masquable par preset).
2. **D2 — Vocabulaire du fichier : `presets` → `scenes` dès la version 3 (proposé), ou garder `presets` et ne
   renommer qu'avec l'éditeur ?** Recommandation : renommer maintenant, avec lecture tolérante, pour ne pas
   refaire une migration à l'étape 6. L'interface continue de dire « preset » jusqu'à l'éditeur.
3. **D3 — Unités du placement : fractions du canvas (retenu par l'owner, 2026-10-30).** La résolution cible
   n'est pas figée à 1080p : un placement en fractions n'a pas à être migré si la source passe en 1440p.
4. **D4 — Borne de couches : 8 (proposé).** Valeur de garde, à réviser après la mesure de charge.
