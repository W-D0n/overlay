# Handoff — 2026-07-25

Focus courant : **fonds autonomes**. Audit produit du 2026-07-24 → 6 ouvertures validées (①→⑥) +
archivage du moteur de scènes (⑦). **①, ⑦, ②, ③, ④ et ⑤ livrés.** Reste ⑥.

## État actuel

- OBS live : `http://localhost:5500/background.html`
- Studio : `http://localhost:5500/dev/studio.html` (une seule entrée : Fonds & presets)
- État live/presets/événements : `dev/background-state-server.js`, port 4462
- 11 effets enregistrés, un seul actif à la fois ; overlay de réaction au-dessus de l'effet
- `main` == `origin/main`, working tree propre, **355 tests verts**
- Tag `scene-engine-v1` (poussé) sur `10369b5` — seule copie du moteur de scènes
- Une seule branche dans le dépôt, locale et distante (convention inscrite dans `CLAUDE.md`)

## Dernier lot — ⑤ Couche branding (livré, 4/4)

Spec `docs/specs/background-branding-layer.md`. Décisions owner : pseudo + réseaux, contenu global
masquable par preset, rattachement double (intégré au fond **et** URL dédiée), placement **libre en
pourcentage posé au glisser-déposer**.

- `branding-format.js` (pur) : normalisation, validation, styles. L'alignement se **déduit** de la
  position (à droite du canvas → aligné à droite), sinon un bloc posé au bord déborderait.
- `components/BrandingLayer.js` : DOM pur, `textContent` jamais `innerHTML`. **LAC-01 résolue** —
  rendu dans un espace de conception 2560×1440 puis `scale(hauteur / 1440)` : les tailles restent
  explicites et suivent la résolution.
- `background.html` : `?branding=only` (couche seule, transparente) et `?branding=off`. Canal
  `/branding-ws` dédié pour propager le contenu en direct.
- Tuner : section « Branding », glisser-déposer dans l'aperçu (`dev/branding-drag.js`, pur), case
  « Afficher sur ce preset ».

### Défauts trouvés en vérifiant

1. **Ordre d'initialisation** : `brandingControls.render()` appelé avant la création du contrôleur.
   L'erreur était **avalée par le `catch` de chargement** — la section démarrait vide en silence,
   puis le premier enregistrement écrasait le contenu par du vide. Corrigé en créant le contrôleur
   avant la lecture d'état. Leçon : un `catch` de chargement qui n'affiche qu'un message masque
   aussi les erreurs de programmation.
2. L'aperçu affichait encore le bloc alors que le preset le masquait. Il montre désormais l'état
   réel (estompé, cerclé) tout en restant déplaçable.

Validé par l'owner en Browser Source réelle le 2026-07-26.

## Lot précédent — ④ Transition entre presets (livré, 4/4)

Spec `docs/specs/background-preset-transitions.md`. Décisions owner : transition déclarée par le
**preset entrant**, répertoire fondu + balayage, et « des réglages pour choisir » plutôt que des
règles implicites (d'où la courbe réglable, pas de défaut différent par type).

- **La transition sert de signal** : présente dans l'état diffusé = arrivée de preset (on anime),
  absente = réglage en cours (`update()` en direct). Sans ça, chaque cran de curseur animerait.
- `background-transition.js` (pur) : `normalizeTransition` corrige pour le rendu,
  `validateTransition` refuse à l'écriture. Réglages : type, durée (0–2000 ms), courbe, sens.
- `background-mount.js` monte chaque effet dans son calque ; les **deux** calques sont animés.
- Tuner : section « Arrivée de ce preset » ; le mapping OBS (③) joint la transition du preset.

### Ce que la vérification visuelle a corrigé (et que les tests unitaires ne voyaient pas)

1. L'animation **sautait** : l'état de départ n'était jamais résolu par le navigateur. Corrigé par
   un flush de style ; mesuré ensuite 83 % → 15 % en progression continue.
2. Le sortant restait **opaque puis disparaissait d'un coup** — mon « fondu » superposait au lieu de
   croiser. Corrigé en fondu croisé réel.
3. Le balayage à **bord net** se lisait comme un masque qui glisse, sur des calques transparents.
   Remplacé par un masque en dégradé animé en position.
4. Ma première symétrie utilisait un dégradé **miroir** : vérifié en teintant les calques, le
   sortant n'apparaissait nulle part. Il faut le dégradé **inversé à la même position**.
5. Résidus : masque laissé en style inline après la transition, et chaîne CSS invalide
   (`a, b 400ms` donne 0 s à `a`). Les deux corrigés.

Validé par l'owner en Browser Source réelle le 2026-07-26.

## Lot précédent — ③ Preset automatique par scène OBS (livré, 4/4)

Spec `docs/specs/obs-scene-preset-mapping.md`. Décision owner : faire ③ malgré la réintroduction
d'une connexion OBS, périmètre réduit à **lire la scène active**.

- `obs-auth.js` **restauré depuis le tag `scene-engine-v1`** avec son test — la raison d'être du tag.
- `obs-scene-mapping.js` (pur) : distingue « scène non associée » de « preset disparu », ne
  normalise pas la casse. `sceneMap` dans le fichier d'état, absent = `{}`, aucune migration.
- `dev/obs-scene-client.js` : v5, abonnement aux seuls événements `Scenes`, reconnexion
  2/5/15/30 s ; mot de passe refusé (4009) → **arrêt** des tentatives + trace explicite.
- Branché dans `background-state-server.js`, **seulement si `OBS_WS_PASSWORD` est présent**.
  Routes `GET /obs-status` et `POST /scene-map`.
- Tuner : section « Scènes OBS » (présentation pure dans `obs-scene-map-presenter.js`, DOM dans
  `obs-scene-map-controller.js`).

### Vérification

- `bun test` : **275/275**.
- Faux OBS rejouant le protocole v5 : 3 scènes listées dans le tuner, association persistée,
  scène associée → preset appliqué, scène libre → rien.
- **Vrai OBS de l'owner (2026-07-25)** : authentification acceptée, 36 scènes remontées, bascule
  réelle sur `STARTING` → le fond est passé en bulles, **confirmé à l'écran par l'owner**.
- Piège rencontré : le faux OBS et le vrai OBS peuvent écouter **tous les deux** sur 4455 sous
  Windows. Toute vérification avec un faux serveur doit utiliser un port distinct (4466 ici) pour
  savoir ce qu'on teste réellement.

## Lot précédent — ② Réactivité audio (livré)

Spec `docs/specs/background-audio-reactivity.md`, faisabilité tranchée dans
`docs/prototypes/2026-07-25-audio-reactivity.md`.

- `audio-levels.js` — pur : spectre → `{ level, bass, mid, treble }`, lissage attaque rapide /
  retour lent, plus `isAudioPeak()` pour les réactions ponctuelles.
- `background-audio.js` — session micro **paresseuse** (aucun `getUserMedia` tant qu'aucun preset
  réactif n'est monté), reprise automatique 2 s / 5 s / 15 s / 30 s, flux relâché dès qu'aucun effet
  réactif n'est affiché. Adaptateur navigateur séparé de la logique, d'où des tests sans matériel.
- `background-mount.js` — `isAudioReactive()` / `applyAudio()`, plus un observateur
  `onMountChange` : la session se resynchronise seule, un futur site d'appel de `apply` ne peut pas
  l'oublier. **Le gate est l'option du preset**, pas la présence de `setAudioLevel` — sinon un
  preset non réactif ouvrirait le micro.
- Effets réactifs : DotGrid (rayon sur le grave, opacité sur l'aigu), Bubble (montée accélérée,
  éclatement sur pic de grave), WaterRipple (une goutte par pic).
- Réglages `audioReactive` / `audioIntensity` par preset ; point d'état micro dans « Avant le live ».

### Vérification

- `bun test` : **230/230**.
- Bout en bout dans `background.html` avec un micro **synthétique** (oscillateur 100 Hz injecté à la
  place du périphérique) : preset non réactif → `getUserMedia` jamais appelé ; preset réactif → un
  seul appel et encre du canvas 5 341 → ~19 500 (points visiblement plus gros) ; retour à non
  réactif → piste `ended` et encre revenue à 4 848. Aucune erreur console hors favicon 404.
- **Confirmé en live par l'owner (2026-07-25)** : l'animation réagit bien à un vrai micro dans
  OBS. Le prototype jetable a été supprimé dans la foulée.

## Lot précédent — ⑦ Archivage du moteur de scènes

Refacto avant suppression, comme prévu :

- `component-registry.js` / `component-names.js` ne portent plus que les 11 effets de fond
  (`DotGridBackground` = `DotGridAnimated`, conservé). `validateComponentRegistry()` retirée
  (plus aucun appelant hors test — l'invariant est vérifié directement par le test).
- `dev/component-field-schemas.js` ne garde que `BACKGROUND_FIELD_SCHEMAS` ;
  `COMPONENT_FIELD_SCHEMAS`, `COMPOSABLE_COMPONENT_NAMES` et `validateFieldSchemas()` supprimés.
- `types.js` réduit à `ComponentName`, `TransitionEasing`, `ComponentInstance`, `ValidationResult`.
- Retirés : `index.html`, `scene-runtime.js`, `scene-resolve.js`, `scene-definition-resolve.js`,
  `placement-resolve.js`, `protocol.js`, `store.js`, `components/index.js`, `scenes/`, `relay/`,
  `obs-config.*`, `dev/overlay-setting.html` + serveurs scène/placement/OBS (`scene-data-server`,
  `scene-history-store`, `scene-placement-format`, `obs-scene-map-*`).
- `dev/dotgrid-tuner.html` **conservé** (owner) et nettoyé : plus d'import `relay/obs-scene-map.js`
  ni `obs-config`, plus de bouton de rafraîchissement OBS ; sauvegarde via `dev/tuner-server.js`
  inchangée.
- Studio à une entrée (`studio.config.js`), lien d'en-tête vers `background.html`.
  `dev/start-dev.js` ne lance plus que statique + background-state et ouvre Studio + rendu OBS.
- Specs du moteur déplacées dans `docs/specs/archive/` ; README, overview, MAP et CLAUDE.md
  (shared surfaces, contrainte 6) mis à jour.

## Vérification

- `bun test` : **193/193 verts** (341 avant retrait des tests du moteur de scènes).
- Serveurs relancés : `background.html` 200, `dev/studio.html` 200, `GET /state` répond,
  `POST /event` accepté (`ok`).
- Playwright : canvas 1920×1080 monté sur `background.html`, 0 erreur console hors favicon 404
  (pré-existant) ; Studio affiche une seule entrée de navigation et l'aperçu DotGrid.

## Restant — dans l'ordre de priorité owner

1. **⑥ Vignettes de presets** — dernière ouverture de l'audit produit.
2. Étendre la réactivité audio aux 8 autres effets, un par un — le contrat est ouvert, il suffit
   d'implémenter `setAudioLevel()` et de déclarer les deux champs.

## Différé

- Intégration Twitch EventSub réelle (postera sur `/event`, point d'entrée générique déjà prêt).
- Réactions d'alerte natives au-delà de DotGrid (overlay partagé couvre les 10 autres).
- ~~Durcissement du harness de tests serveur~~ — fait le 2026-07-25 : le port des tests
  `Bun.spawn` était dérivé du PID, donc identique d'une exécution à l'autre ; deux `bun test`
  rapprochés se marchaient dessus. Remplacé par un port éphémère attribué par l'OS
  (`reserveFreePort`). 8 exécutions consécutives de la suite complète : 193/193 à chaque fois.

## Résolution — passage en 2560×1440 (2026-07-25)

L'owner est passé en 2560×1440 dans OBS. `background.html` et `tokens.css` **figeaient la page à
1920×1080** : mesuré avant correctif, la couche restait à 1920×1080 dans une fenêtre plus grande,
donc bandes vides à droite et en bas dans une source 1440p. Corrigé — `html, body` et `#bg-layer`
épousent la source, `viewport` en `device-width`. Vérifié après : la couche et le canvas font
exactement la taille de la fenêtre ; Studio sans régression.

À surveiller : les effets couvrent une surface **1,8× plus grande**, donc plus de pixels à peindre.
Les défauts en pixels (espacement DotGrid, tailles de formes) paraissent aussi plus petits
relativement — à réajuster au goût dans le tuner, aucun code à changer.

## Dernier lot — audio sur les 11 effets + UX du tuner + ⑥ vignettes (2026-07-26)

Mandat owner : « fais 3+1 et fais passer l'ux/ui du tuner au niveau pro ».

- **UX du tuner** : trois espaces de travail (Fond / Habillage / Diffusion), hiérarchie serif/mono,
  panneau opaque. Défilement pour atteindre un réglage : **5,4 → 1,7 écrans**. Contraste vérifié
  (titres 17,3:1, étiquettes 6,8:1). Piège évité de justesse : mon premier jet avait rendu les
  étiquettes **moins** lisibles (`--color-text-dim`), c'est la mesure qui l'a montré.
- **⑥ vignettes** : `docs/specs/background-preset-thumbnails.md`. Photo capturée puis effet démonté
  (0 canvas, 0 animation au repos), animation au survol, file d'attente séquentielle.
- **Audio sur les 8 effets restants** : `components/audio-reaction.js` porte le motif commun.
  Réaction propre à chaque effet, listée dans la spec.
- **Correction de fond sur `level`** : il moyennait 20–8000 Hz, donc une voix ou une basse tombait
  sous 10 % et les effets pilotés par `level` ne bougeaient que de quelques pourcents. `level` est
  désormais la **bande la plus chargée**, et chaque bande son **maximum** plutôt que sa moyenne.
  Mesuré : ton pur → 1,0 ; bruit large → 0,87. Cela rend aussi DotGrid, Bubble et WaterRipple plus
  réactifs qu'au moment de leur validation.

### Ce que la vérification n'a pas pu prouver

Le pixel-diff **sature** sur les champs de lignes fines (Rain, FloatingSymbols) : un déplacement
d'un pixel change déjà tous les pixels de la ligne, donc une accélération ne s'y mesure plus.
Vérifiés indirectement : niveaux corrects, `setAudioLevel` présent sur les 11 effets, session micro
demandée une fois, et variation franche visible sur Fireflies (×2), StarsParallax (×13) et
ShapeMorph (×2). **L'amplitude visuelle des effets pilotés par la vitesse reste à juger par l'owner
dans OBS.**

## Notes ouvertes

- **Prochaine session : commencer par `docs/inbox.md`**, section « À regarder en priorité ». Elle
  porte le protocole de QA OBS 1440p et recevra le retour d'audit de l'owner.

- L'état de l'owner porte un branding de départ (« D0n », twitch + @mozaik, bas à gauche), posé
  pour la vérification et validé tel quel.

- Deux presets de test taggés `test-transition` (« Test fondu lent », « Test balayage ») restent
  dans l'état de l'owner — à supprimer quand ils n'ont plus d'utilité.
- Le serveur statique sert désormais tout en `no-store` : sans ça, la Browser Source OBS gardait
  d'anciens modules et exécutait du code corrigé depuis longtemps.

- Les guides `utiliser-le-panneau` et `harmoniser-scenes-obs` ont été retirés (ils décrivaient
  l'éditeur de scènes et le relais OBS archivés). `creer-un-composant` est réécrit côté fond seul.
  Les guides `.html` restent maintenus **à la main** en parallèle des `.md` — divergence facile,
  aucun générateur.

- `docs/inbox.md` : validations visuelles ShapeMorph/ColorDrops/OBS native toujours en attente ;
  les décisions différées « preset par scène OBS » et « repositionnement dynamique » y parlent
  encore du moteur de scènes, à retrancher au prochain triage.
- `NUMBER_FIELD_GUIDANCE` contient des clés sans champ correspondant (`backgroundOpacity`,
  `gridSize`, `horizon`, `vanishingX`, `perspective`, `fade`, `glow`) — pré-existant, non traité ici.
- Aucune branche parallèle restante : `codex/background-studio` n'existe plus, ni en local ni sur
  `origin`.
