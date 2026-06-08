# MAP — Overlay Stream D0n / Mozaïk

> Feuille de route et état d'avancement. Mis à jour en clôture de session (`/done`).

## Focus actuel

**Session 3** — migration page-unique runtime : moteur qui lit les `SceneConfig`, monte les couches
par `data-layer`, applique les transitions (résolution cascade + `DEFAULT_TRANSITION`) et le niveau
de visibilité. Consomme le protocole et le format livrés en S2.
Spec : `docs/specs/scene-runtime-engine.md` (Draft).

## Découpage des sessions

| Session | Périmètre | État |
|---|---|---|
| S1 | DotGridAnimated — couches 1 (base aléatoire) + 2 (Simplex ambiant par mode) | ✅ fait |
| S2 | Format de config de scène + protocole `{type,data}` étendu | ✅ fait |
| S3 | Migration page-unique runtime ([spec](specs/scene-runtime-engine.md)) | ⬜ à venir |
| S4 | Relais Bun (WS + HTTP `/emit`, auth OBS, secret en env) | ⬜ à venir |
| S5 | Éditeur jalon 1 (placement drag + lecture anchor/offset) | ⬜ à venir |
| Épopée | Éditeur complet, orchestration OBS programmatique, skill recherche graphique | ⬜ hors scope |

## Détail S1 (livré)

- `components/simplex.js` — Simplex 2D Gustavson, `simplex2(x,y) → [-1,1]`, zéro dépendance.
- `components/DotGridAnimated.js` — couches 1+2, stockage SoA, `setMode`/`destroy` fonctionnels, `trigger`/`morphTo` en stubs.
- `scenes/BRB.html` — branché sur `DotGridAnimated({ mode: 'brb' })`.

## Détail S2 (livré)

- `docs/specs/scene-config-protocol.md` — spec (reviewée 2× : 38 AC, 17 typedefs, 0 smoke test).
- `protocol.js` — logique pure : `reduceMessage` (11 types), `validateSceneConfig` (V0→V9), `DEFAULT_TRANSITION`, `DEFAULT_DOTGRID_MODE`. Zéro DOM/réseau/temps.
- `store.js` — refactoré en coquille d'effets (plus de `switch`) ; horloge injectée + effet `reset-duration-timer`.
- `types.js` — +17 typedefs, `StreamState` étendu (`currentScene`, `visibilityLevel`).
- `scenes/{discussion,brb,codage}.config.js` — 3 configs de référence.
- `protocol.test.js` — 41 tests `bun test` autonomes.
- Décisions structurantes : AD-1 (logique pure / effets), AD-2 (placement dans le CSS), AD-3 (état de repos). Voir `devlog.md`.

## Frictions séquencées (issues de la review S2)

- FRIC-S2-01 : 5 configs restantes (interview, react, creation, fin, jeu) → S3.
- FRIC-S2-03 : restriction `imageUrl` (morph bitmap) aux assets locaux → couche 3A.
- FRIC-S2-04 : doc sécurité diffusion publique → S4/publication.
- FRIC-S2-05 : format d'échange de l'éditeur (placement = CSS) → S5.

## Reste à faire (hors S1, déjà identifié)

- Migration des 6 autres scènes (Discussion, Codage, Interview, React, Creation3D, FinStream) vers `DotGridAnimated` + branchement sur les `SceneConfig` → prévu S3.
- Couches 3 (morphisme) et 4 (événements stream) du DotGrid → sessions ultérieures, voir `HANDOFF_overlay_dotgrid.md`.
