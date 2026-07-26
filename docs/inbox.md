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
   2560×1440, soit 1,8× la surface de l'ancien 1080p. C'est le seul risque de performance identifié
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

## Protocole de QA OBS 1440p

**Pourquoi** : chaque fonction a été validée isolément, jamais toutes ensemble en conditions de live.
L'objectif est de trouver ce qui casse quand elles cohabitent, et de mesurer le coût réel.

**Préparation**

- Lancer `start-stream.bat` (statique + état du fond). Pour tester le mapping de scènes, lancer
  `start-dev.bat` à la place et vérifier que `.env` contient `OBS_WS_PASSWORD`.
- OBS lancé **par le raccourci portant `--enable-media-stream`** (sans quoi l'audio ne peut pas
  fonctionner), canvas 2560×1440.
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
- [ ] Section « Avant le live » : le point micro reflète l'état réel.

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
- [ ] Taille correcte à 1440p (36/18 px de référence).

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

- (vide)

---

## Décisions produit tranchées (2026-07-26)

- ~~**Preset automatique par scène OBS**~~ — fait, ③ : `docs/specs/obs-scene-preset-mapping.md`.
- ~~**Miniatures de presets**~~ — fait, ⑥ : `docs/specs/background-preset-thumbnails.md`.
- **Repositionnement dynamique pendant une scène** — sans objet depuis l'archivage du moteur de
  scènes ; le branding, lui, se repositionne au glisser-déposer.
