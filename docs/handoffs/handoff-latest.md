# Handoff — 2026-07-25

Focus courant : **fonds autonomes**. Audit produit mené le 2026-07-24 → 6 ouvertures validées par
l'owner (①→⑥) + décision d'**archiver** le moteur de scènes (⑦). Première ouverture **①** livrée et
fusionnée dans `main`.

## État actuel

- OBS live : `http://localhost:5500/background.html`
- Studio : `http://localhost:5500/dev/studio.html`
- État live/presets/**événements** : `dev/background-state-server.js`, port 4462
- 11 effets enregistrés, un seul actif à la fois ; overlay de réaction au-dessus de l'effet
- `main` == `origin/main` à `fd1a3a5`, working tree propre, **341 tests verts**
- Branche `codex/background-studio` conservée (homologue distant en retard, non nettoyée)

## Dernier lot — ① Fonds réactifs (livré, fusionné)

Spec `docs/specs/background-reactive-events.md`, plan `docs/superpowers/plans/2026-07-24-background-reactive-events.md`.

En mode background-only, `DotGridAnimated.trigger()` existait mais rien ne l'appelait (plus de
`scene-runtime`/`store`/`relay`). Ajouté :

- `POST /event` + `WS /event-ws` **éphémères** sur `background-state-server` (validés, jamais persistés
  dans `background-state.json`). Validation pure : `dev/background-event-format.js`.
- `components/ReactionOverlay.js` — overlay partagé `{ el, trigger, destroy }`, 4 réactions or Atelier
  (follow/sub/raid/bits), RAF paresseux (démarre au trigger, s'arrête à la fin), `z-index:1` structurel
  (`OVERLAY_CANVAS_STYLE`).
- `background-reactions.js` — coordinateur : réaction **native** si l'effet expose `trigger()`
  (DotGrid), sinon **overlay** (les 11 autres). `background-mount.react()` fait le routage.
- Tuner : section « Tester une réaction » (4 boutons → `POST /event` via le serveur, donc l'URL OBS
  réagit aussi) ; l'aperçu réagit via le même coordinateur.

## Vérification

- `bun test` : **341/341 verts**, stable (2 runs complets + 10 ciblés).
- Playwright live sur `background.html` : overlay transparent au repos → peint pendant la réaction →
  se nettoie et arrête son RAF à la fin ; chemin natif DotGrid laisse l'overlay vide ; 0 erreur console.
- Bug trouvé/corrigé en vérif : l'effet ré-appendu passait au-dessus de l'overlay → corrigé par
  `z-index` (constante testée).

## Restant — dans l'ordre de priorité owner

1. **⑦ Archiver le moteur de scènes** — stratégie retenue : **suppression du working tree + tag git
   `scene-engine-v1`**. Refacto, pas un `rm` : `component-registry.js` mélange widgets de scène
   (`components/index.js`) ET effets de fond, et `DotGridBackground === DotGridAnimated` (à GARDER).
   Scinder le registre fond/scène avant de retirer `index.html`, `scene-runtime.js`, `scenes/`,
   `relay/`, `store.js`, `protocol.js`, `dev/overlay-setting.html` + serveurs scène/placement/OBS, et
   l'onglet « Scènes complètes » du Studio. À faire en session dédiée.
2. **② Réactivité audio** — prototyper la feasibility (capture son en Browser Source OBS → source
   micro la plus fiable) AVANT d'écrire une spec.
3. **③→⑥** — mapping scène OBS→preset, transition entre presets, couche branding, vignettes de presets.

## Différé (hors ①)

- Intégration Twitch EventSub réelle (postera sur `/event`, point d'entrée générique déjà prêt).
- Réactions natives sur mesure au-delà de DotGrid (overlay partagé couvre les 11 autres).
- Durcissement du harness de tests serveur (ports éphémères) — les tests `Bun.spawn` restent
  sensibles à la contention de ports sous forte charge.

## Notes ouvertes

- `docs/inbox.md` : validations visuelles ShapeMorph/ColorDrops/OBS native toujours en attente.
- Rien n'est poussé au-delà de `main` ; la branche `codex/background-studio` peut être nettoyée une
  fois sûr qu'elle n'est plus utile côté distant.
