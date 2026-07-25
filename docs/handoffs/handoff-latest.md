# Handoff — 2026-07-25

Focus courant : **fonds autonomes**. Audit produit du 2026-07-24 → 6 ouvertures validées (①→⑥) +
archivage du moteur de scènes (⑦). **① et ⑦ livrés.**

## État actuel

- OBS live : `http://localhost:5500/background.html`
- Studio : `http://localhost:5500/dev/studio.html` (une seule entrée : Fonds & presets)
- État live/presets/événements : `dev/background-state-server.js`, port 4462
- 11 effets enregistrés, un seul actif à la fois ; overlay de réaction au-dessus de l'effet
- `main` == `origin/main` à `3c389d1`, working tree propre, **193 tests verts**
- Tag `scene-engine-v1` (poussé) sur `10369b5` — seule copie du moteur de scènes
- Une seule branche dans le dépôt, locale et distante (convention inscrite dans `CLAUDE.md`)

## Dernier lot — ⑦ Archivage du moteur de scènes

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

1. **② Réactivité audio** — **faisabilité validée le 2026-07-25** en Browser Source réelle
   (`audio LU`). La voie retenue est la lecture directe du micro dans `background.html` ; la voie
   obs-websocket est écartée. Détail et contraintes permanentes :
   `docs/prototypes/2026-07-25-audio-reactivity.md`. **Prochaine étape : écrire la spec.**
2. **③→⑥** — mapping scène OBS→preset, transition entre presets, couche branding, vignettes de
   presets.

## Différé

- Intégration Twitch EventSub réelle (postera sur `/event`, point d'entrée générique déjà prêt).
- Réactions natives sur mesure au-delà de DotGrid (overlay partagé couvre les 10 autres).
- ~~Durcissement du harness de tests serveur~~ — fait le 2026-07-25 : le port des tests
  `Bun.spawn` était dérivé du PID, donc identique d'une exécution à l'autre ; deux `bun test`
  rapprochés se marchaient dessus. Remplacé par un port éphémère attribué par l'OS
  (`reserveFreePort`). 8 exécutions consécutives de la suite complète : 193/193 à chaque fois.

## Notes ouvertes

- `docs/inbox.md` : validations visuelles ShapeMorph/ColorDrops/OBS native toujours en attente ;
  les décisions différées « preset par scène OBS » et « repositionnement dynamique » y parlent
  encore du moteur de scènes, à retrancher au prochain triage.
- `NUMBER_FIELD_GUIDANCE` contient des clés sans champ correspondant (`backgroundOpacity`,
  `gridSize`, `horizon`, `vanishingX`, `perspective`, `fade`, `glow`) — pré-existant, non traité ici.
- Aucune branche parallèle restante : `codex/background-studio` n'existe plus, ni en local ni sur
  `origin`.
