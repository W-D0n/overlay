# Handoff — 2026-07-25

Focus courant : **fonds autonomes**. Audit produit du 2026-07-24 → 6 ouvertures validées (①→⑥) +
archivage du moteur de scènes (⑦). **①, ⑦, ② et ③ livrés.**

## État actuel

- OBS live : `http://localhost:5500/background.html`
- Studio : `http://localhost:5500/dev/studio.html` (une seule entrée : Fonds & presets)
- État live/presets/événements : `dev/background-state-server.js`, port 4462
- 11 effets enregistrés, un seul actif à la fois ; overlay de réaction au-dessus de l'effet
- `main` == `origin/main`, working tree propre, **275 tests verts**
- Tag `scene-engine-v1` (poussé) sur `10369b5` — seule copie du moteur de scènes
- Une seule branche dans le dépôt, locale et distante (convention inscrite dans `CLAUDE.md`)

## Dernier lot — ③ Preset automatique par scène OBS (livré, 4/4)

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

1. **④→⑥** — transition entre presets, couche branding, vignettes de presets.
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

## Notes ouvertes

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
