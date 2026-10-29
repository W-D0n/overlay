---
created: 2026-06-06
updated: 2026-10-29
---

# Inbox — Overlay Stream

Notes et items qui restent à traiter. Les clôtures récentes sont consignées dans
[`docs/devlog.md`](devlog.md) ; l’historique détaillé des décisions vit dans
[`docs/backlog-history.md`](backlog-history.md).

---

## À regarder en priorité à la prochaine session d'audit / review

Cette section est le point d'entrée de la prochaine revue : commencer ici, avant toute nouvelle
fonctionnalité.

1. **Le retour d'audit de l'owner** — noté dans « Résultats de l'audit » plus bas. S'il contient des
   constats, ils passent avant tout le reste.
2. **Les trois validations visuelles en attente** (ShapeMorph, ColorDrops, amplitude audio) — voir
   ci-dessous. Aucune n'est mesurable automatiquement, elles bloquent donc sur un regard.
3. **Le coût machine pendant une transition** — deux effets tournent simultanément sur un canvas
   1920×1080 (le 2560×1440 précédent en avait 1,8× la surface). C'est le seul risque de performance identifié
   et jamais mesuré en conditions de live (LAC-01 de
   `docs/specs/background-preset-transitions.md`).

## Validation visuelle en attente

Ces trois points demandent un jugement humain ; ils ne se prouvent pas par un test.

- **ShapeMorph** — qualité des cinq contours (pizza, étoile ninja, casque, carapace, masque) et de
  leurs interpolations. Regarder dans le tuner en enchaînant les formes.
- **ColorDrops** — rendu, rythme et lisibilité des gouttes colorées.
- **Amplitude des réactions audio** — Rain, FloatingSymbols, ColorDrops et OrbitingShapes réagissent
  au son, mais la mesure automatique **sature** sur ces rendus (un déplacement d'un pixel change
  déjà tous les pixels d'une ligne fine). Seul un regard peut dire si la réaction est trop discrète
  ou trop forte. Voir `docs/specs/background-audio-reactivity.md`.

---

## QA court — référence avant la migration (2026-10-29)

À passer **avant** toute modification du moteur de rendu (étape 2 de `docs/architecture-review.md`).
Durée visée : une trentaine de minutes, dont dix à quinze de simple attente. Il remplace le protocole
complet ci-dessous pour cette échéance ; celui-ci reste valable avant un live important.

**Sécurité.** Les correctifs U1 et U2 sont appliqués (`docs/security.md`) : les serveurs n'écoutent que sur `127.0.0.1`. Si les serveurs ont tourné avant le 2026-10-29 sur un réseau partagé, changez quand même le mot de passe OBS.

**Préparation.** OBS lancé par le raccourci portant `--enable-media-stream`, canvas 1920×1080, Browser
Source `http://localhost:5931/background.html` avec vos réglages habituels (« Rafraîchir quand la scène
devient active » cochée). Statistiques OBS ouvertes (Affichage → Statistiques).

**Chaque case : noter ce que vous voyez, même si c'est « rien d'anormal ».** Les valeurs chiffrées
servent de référence pour comparer après la refonte.

**1. Votre symptôme d'origine — la source à réactualiser au démarrage** *(la cause est inconnue)*
- [ ] Serveurs **arrêtés**, lancer OBS, **puis** lancer `start-stream.bat`. Attendre 60 s sans toucher
      à la source. Le fond s'affiche-t-il seul ? Combien de temps après le lancement des serveurs ?
- [ ] Même test avec « Rafraîchir quand la scène devient active » **décochée**.
- [ ] Serveurs lancés **avant** OBS : le fond est-il affiché dès l'ouverture d'OBS ?
- Ce que cela départage : la page se reconnecte-t-elle seule dans OBS (comme dans mon navigateur de test) ?

**2. Aspect des onze effets à 1080p** *(aucune mesure automatique ne remplace votre regard)*
- [ ] Choisir chaque effet dans le tuner : remplit tout le cadre, aucune bande vide, pas de scintillement.
- [ ] Étoiles de StarsParallax : points visibles et lisibles à cette taille ?
- [ ] GeometricPattern : seul effet non-canvas, à regarder en particulier.

**3. Charge — la valeur de référence**
- [ ] Pour DotGrid en mode de couleur `noise` puis `glow`, et pour ShapeMorph : relever dans les
      statistiques OBS le **FPS** et les **images perdues** sur une minute, et le CPU/GPU.
- [ ] Même relevé pour Rain (effet léger), pour comparaison.
- Hypothèse à confirmer : DotGrid est le plus coûteux (5 184 points par image à 1080p).

**4. Défaut de temps avec le son** *(découvert par la lecture, jamais observé : `architecture-review` A2)*
- [ ] Activer « Réagit au son : Oui » sur **Fireflies**, **StarsParallax** et **OrbitingShapes**, puis
      parler ou mettre de la musique. Observer : les étoiles et les formes **sautent-elles** de position
      au lieu de glisser ? Même observation sur **Rain** ou **ColorDrops** pour comparer.
- [ ] Laisser tourner **10 minutes** avec le son actif puis recommencer l'observation : est-ce pire ?
      (Prédiction du calcul : oui, le saut croît avec la durée.)

**5. Transitions avec votre réglage OBS**
- [ ] Deux scènes OBS associées à deux presets d'effets différents (section « Scènes OBS », mot de passe
      OBS renseigné dans `.env`). Basculer d'une scène à l'autre : un **fondu** se joue-t-il, ou le
      fond change-t-il d'un coup ?
- [ ] Même test avec « Rafraîchir quand la scène devient active » décochée.
- Hypothèse à confirmer : avec le rafraîchissement coché, la page recharge et ne peut jamais animer.

**6. Scènes OBS**
- [ ] Créer une nouvelle scène dans OBS **pendant que le serveur est connecté**, puis cliquer
      « Actualiser » dans « Scènes OBS » : la nouvelle scène apparaît-elle ? (Lecture : non, C6.)

**7. Micro**
- [ ] Parler : la réaction est visible sans être envahissante. Couper le micro dans Windows en pleine
      réaction : l'effet revient à son animation normale, sans figer.

**8. Branding à 1080p**
- [ ] Le pseudo et la ligne ont **le même aspect qu'avant** (migration ×0,75 : 27 et 19,5 px).
      Lisible sur vos fonds clairs et au-dessus d'une caméra (`?branding=only`).

**9. Stockage de la Browser Source** *(décide si le cache du rendu peut être activé, `docs/specs/socle-rendu-etapes-1-2.md` §1b)*
- [ ] Ajouter une Browser Source de test sur `http://localhost:5931/dev/storage-probe.html`. Noter ce qu'elle affiche (« PREMIÈRE visite »), **fermer OBS complètement**, le relancer : affiche-t-elle « MÉMORISÉ » et la date d'origine ?
- [ ] Même test avec « Désactiver la source quand elle n'est pas visible » cochée, puis avec « Rafraîchir quand la scène devient active » cochée (changer de scène, revenir : le compteur de chargements augmente-t-il, la date reste-t-elle ?).
- Si « MÉMORISÉ » : le cache peut être activé. Sinon il reste inutile et le serveur doit être démarré avant OBS.

**9. Tuner**
- [ ] Taper une lettre dans la recherche : les vignettes des « Points de départ » disparaissent-elles ?
      (Mesuré dans un navigateur de test : oui, D2.)
- [ ] « Essayer » un point de départ : le fond **dans OBS** change-t-il immédiatement ? (Lecture : oui, D1.)

**Où noter** : sous « Résultats de l'audit » ci-dessous, une ligne par constat, avec le numéro de case.

## Protocole de QA OBS 1080p

**Pourquoi** : chaque fonction a été validée isolément, jamais toutes ensemble en conditions de live.
L'objectif est de trouver ce qui casse quand elles cohabitent, et de mesurer le coût réel.

**Préparation**

- Lancer `start-stream.bat` (statique + état du fond). Pour tester le mapping de scènes, lancer
  `start-dev.bat` à la place et vérifier que `.env` contient `OBS_WS_PASSWORD`.
- OBS lancé **par le raccourci portant `--enable-media-stream`** (sans quoi l'audio ne peut pas
  fonctionner), canvas 1920×1080.
- Ouvrir le gestionnaire des tâches ou les statistiques OBS pour voir CPU/GPU et les images perdues.

**Les onze effets, un par un** — `background.html` en source, effet choisi dans le tuner.

- [ ] Chacun s'affiche, remplit tout le canvas, aucune bande vide sur les bords.
- [ ] Aucun scintillement ni saccade visible à l'œil.
- [ ] Noter le FPS affiché par le tuner et les images perdues côté OBS pour le plus coûteux.

**Réactions aux alertes** — section « Tester une réaction » du tuner, les quatre boutons.

- [ ] Follow, sub, raid, bits produisent chacun un effet visible dans OBS.
- [ ] Sur DotGrid (réaction native) **et** sur un autre effet (overlay partagé).

**Réactivité au son** — préréglage avec `Réagit au son : Oui`.

- [ ] Parler dans le micro : la réaction est visible sans être envahissante.
- [ ] Tester `Intensité` à 0,5 / 1 / 2 et noter la valeur qui te convient par effet.
- [ ] Couper le micro dans Windows en pleine réaction : l'effet doit revenir à son animation
      normale, sans figer ni disparaître.
- [ ] Bandeau « Antenne » : le point micro reflète l’état réel ; avec la source OBS ouverte, « Page de rendu » indique 1 page connectée (0 après avoir désactivé la source).

**Mapping scène OBS → preset**

- [ ] Associer deux scènes à deux presets, basculer entre elles : le fond suit.
- [ ] Une scène **non** associée ne change rien.
- [ ] Fermer OBS puis le relancer : la reconnexion se fait seule (le serveur d'état reste ouvert).

**Transitions** — le point le plus sensible pour la performance.

- [ ] Fondu et balayage, aux quatre sens, entre deux presets d'effets différents.
- [ ] **Enchaîner rapidement trois changements de scène** : aucun empilement, un seul fond à la fin.
- [ ] Surveiller CPU/GPU **pendant** la transition (deux effets tournent) et noter le pic.
- [ ] Vérifier qu'aucune image n'est perdue côté OBS pendant l'enchaînement.

**Branding**

- [ ] Lisible sur tes fonds réels, notamment les plus clairs (StarsParallax, GeometricPattern).
- [ ] `?branding=only` posé au-dessus d'une cam ou d'un gameplay : fond bien transparent.
- [ ] Un preset qui le masque le fait disparaître dans OBS.
- [ ] Taille correcte à 1080p. Le code met encore le branding à l'échelle de 1440 de hauteur
      (27/13,5 px effectifs sur 1080p) : la référence de conception reste à trancher.

**Les URL, une par une**

- [ ] `background.html` — suit le tuner en direct.
- [ ] `background.html?preset=<id>` — reste sur son preset quoi que fasse le tuner.
- [ ] `?transparent=1`, `?branding=only`, `?branding=off`, `?quality=performance`.

**Endurance** — le test qui ne peut pas être simulé.

- [ ] Laisser tourner **30 minutes** avec un effet réactif au son et le mapping actif.
- [ ] À la fin : le FPS n'a pas chuté, la mémoire n'a pas gonflé, rien ne s'est arrêté.

### Résultats de l'audit

> À remplir par l'owner. Un constat par ligne, avec l'effet ou la fonction concernée. Inutile de
> diagnostiquer : décrire ce qui a été vu suffit, l'investigation viendra ensuite.

**Constats de l'owner (2026-10-29)**

- **Source à réactualiser à chaque démarrage d'OBS** — non reproduit hors OBS (voir ci-dessous) ;
  cause non établie, à diagnostiquer dans OBS même.
- **Les fonctions de l'outil ont été confuses à l'usage** : seul le fond était utilisé. Revue
  ouverte dans [`revue-fonctions.md`](revue-fonctions.md).
- **Canvas OBS de l'owner : 1920×1080.** Décision prise : la référence du projet passe à 1080p (le
  1440p posait des problèmes avec certaines scènes et sources OBS). `CLAUDE.md` §2, README, guide et
  protocole de QA mis à jour. **Reste** : la constante `BRANDING_REFERENCE_HEIGHT = 1440`
  (`components/BrandingLayer.js`) et les valeurs 36/18 px de `branding-format.js`, en attente d'un
  choix de l'owner (changer la référence modifie l'aspect du branding en live).
- **Réglages de la Browser Source** (`http://localhost:5931/background.html`) : « Désactiver quand
  non visible » décochée, « Rafraîchir quand la scène devient active » **cochée**. L'hypothèse du
  port périmé est éliminée (le port est le bon).

**Passe automatisée (2026-10-29, Chromium à 2560×1440, serveurs lancés puis coupés)**

Vérifié :

- `bun test` : 372 pass, 0 fail.
- **Reconnexion** : `background.html` chargé avec le serveur d'état arrêté, puis serveur démarré →
  le fond et le branding s'affichent seuls en moins de 8 s, sans rafraîchissement.
- **Onze effets** : chacun se monte sans erreur et crée un canvas 2560×1440 (GeometricPattern n'a pas
  de canvas, rendu non sondé). StarsParallax vérifié à l'écran : points très petits (~1-2 px).
- **Quatre réactions** (follow, sub, raid, bits) : le canvas d'overlay passe de 0 pixel allumé (sans
  événement) à une valeur non nulle pour chacune.

Non vérifié — demande OBS ou un regard :

- FPS et images perdues réels : le FPS mesuré (165) est le plafond d'affichage du navigateur de test,
  pas une mesure de charge.
- Rendu visuel de chaque effet (scintillement, bandes sur les bords, lisibilité).
- Audio micro, mapping scène → preset (`sceneMap` est **vide** dans l'état actuel, un seul preset
  existe), transitions, branding sur cam, endurance 30 min.
- Le comportement de la source **dans OBS** au démarrage (CEF, réglages de la source).

---

## Décisions produit tranchées (2026-07-26)

- ~~**Preset automatique par scène OBS**~~ — fait, ③ : `docs/specs/obs-scene-preset-mapping.md`.
- ~~**Miniatures de presets**~~ — fait, ⑥ : `docs/specs/background-preset-thumbnails.md`.
- **Repositionnement dynamique pendant une scène** — sans objet depuis l'archivage du moteur de
  scènes ; le branding, lui, se repositionne au glisser-déposer.
