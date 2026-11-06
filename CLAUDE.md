# CLAUDE.md — Projet Overlay Stream (D0n / Mozaïk)

Habillage stream pour OBS Browser Source, direction artistique **Atelier**.
HTML/CSS/JS natif, ES modules, **zero build step, zero dépendance npm**.

---

## Path Mappings

| Concept | Path |
|---|---|
| `{overview}` | `docs/overview.md` |
| `{inbox}` | `docs/inbox.md` |
| `{specs}` | `docs/specs/` |
| `{workflows}` | `docs/workflows/` |

---

## Contraintes absolues du projet

Ces règles priment sur toute préférence de style. Elles découlent du contexte live (OBS).

1. **Zero build, zero dépendance** — HTML/CSS/JS natif uniquement. Aucun `npm install`,
   aucun framework, aucune lib externe. Toute fonction (ex : Simplex noise) est portée from scratch.
   Exception de périmètre (2026-10-29) : l'outillage de **dev** qui ne s'exécute ni dans OBS ni dans
   le live (vérificateur de types, packaging) est permis, lancé à la demande sans rien installer dans
   le dépôt (`bunx`). Aucun code d'outillage n'est importé par l'overlay.
   Typage : `bun tools/typecheck.js` (TypeScript sur les JSDoc `// @ts-check`, `tsconfig.json` strict) ;
   la dette connue est figée par fichier dans `tools/typecheck-baseline.json` et ne peut que baisser.
2. **Résolution de la source OBS = un paramètre, pas une constante du code** — la source de référence est
   aujourd'hui 1920×1080 (le 2560×1440 posé le 2026-07-25 posait des problèmes avec certaines scènes et
   sources OBS ; le 1440p reste possible plus tard). Elle est déclarée **une seule fois** dans
   `render-reference.js` ; l'aperçu, les vignettes et le branding la lisent de là, la page de rendu épouse
   sa source et ne fige aucune dimension. Aucun autre fichier source n'écrit 1920 ni 1080 (garde : `tools/guards/render-reference.test.js`) ;
   les positions et tailles de couches se stockent en **fractions** du canvas. `pointer-events: none`.
   Les effets dessinent dans ce repère de référence : `src/components/canvas-layer.js` (et `ReactionOverlay`,
   `GeometricPatternBackground`) mettent le dessin à l'échelle de la source réelle, donc **une taille en px
   dans un effet vaut pour la hauteur de référence** et suit la résolution de la source sans code d'effet.
   Les interfaces de dev s'adaptent à l'écran (colonnes proportionnelles, empilement sous 1100 px, aperçu
   agrandi ou réduit) : aucune largeur de panneau ni aucun plafond de taille figé.
3. **Source de vérité design** — toutes les variables visuelles dans `tokens.css`. Jamais de valeur
   hardcodée dans un composant si un token existe.
4. **Pattern composant** — chaque composant est une fonction retournant
   `{ el, update?(data), destroy?() }`. Voir `src/components/*Background.js`.
5. **Configuration hors composant** — données statiques qui pilotent un composant (schémas de
   champs, items de nav, options) → fichier `*.config.js` dédié, jamais en dur dans le composant.
6. **Protocoles locaux explicites** — l'état du fond (`{ component, options }`) et les événements de
   réaction (`{ type, username?, amount? }`) sont consommés sans connaître leur source.
   Indépendance = protocole, pas absence de connexion. Voir `{overview}`.

---

## Structure du dépôt

Racine courte et fixe (garde : `tools/guards/repo-layout.test.js`) : `background.html` (entrée OBS, URL stable),
`ports.config.js`, `tsconfig.json`, les lanceurs `studio.bat` (Studio, ouvre le navigateur), `stream.bat` (live) et
`kill-servers.bat`. Aucun module à la racine.

- `src/` — le moteur : `scene/` (document et moteur de scène), `layers/` (types de couche, animation, filtres, masque,
  groupes, timeline, liaisons), `background/` (état, sélection, transitions, réactions, audio), `render/` (source de
  rendu OBS), `obs/` (connexion et correspondance scène ↔ preset), `branding/`, `src/components/` (effets et couches),
  `shared/`, `styles/tokens.css`, `types.js`. Les essais vivent à côté du module qu'ils couvrent.
- `studio/` — l'application de création (navigateur) : `editor/`, `canvas/`, `inspector/`, `layers/`, `presets/`, `settings/`,
  `ui/`, `bench/` ; point d'entrée `index.html` + `main.js`.
- `server/` — les serveurs Bun : `lifecycle/` (lancement, arrêt, supervision), `routes/`, `stores/`, `integrations/`
  (OBS, Twitch, Twitchat).
- `tools/` (contrôle de types, gardes permanentes dans `guards/`), `e2e/` (essais de bout en bout), `data/` (état local, jamais versionné).
- `src/shared/` — formats et utilitaires communs au Studio et aux serveurs. Seuls `src/`, `studio/` et `background.html` sont servis ;
  `server/`, `tools/`, `e2e/` et `data/` ne le sont jamais (`server/local-access-policy.js`).
- Dans `src/`, un nom de fichier est unique : le nom seul (`scene-doc.js`) suffit à désigner un module.

---

## Shared surfaces — à vérifier avant tout changement

- `tokens.css` — touché par tous les effets et toutes les surfaces de dev
- `types.js` — types JSDoc partagés
- `layer-kinds.js` / `component-registry.js` — description (identifiants, libellés, capacités, champs) et fabriques des types de couche : les effets de fond et le branding (couche d'identité, contenu global dans `branding-content.js`)
- `scene-doc.js` / `scene-runtime.js` — le document de scène (couches, placement en fractions, chemins) et le moteur qui le monte
  (réconciliation, transitions, routage audio et réactions ; les couches d'identité restent au-dessus des transitions) : consommés par
  `background.html`, l'aperçu du Studio et les vignettes
- `studio/editor/scene-editor.js` / `studio/editor/studio-document.js` — le modèle d'édition d'une scène (toujours valide, historique annulable) et le document du Studio (scène brouillon, antenne, preset ouvert, brouillon calculé) : consommés par l'aperçu, la liste des presets, les brouillons et la publication
- `studio/inspector/component-field-schemas.js` — vue « formulaire » de `layer-kinds.js` pour le tuner
- Le **format d'état du fond** — spécifié dans `docs/specs/background-standalone.md` : le serveur manipule des scènes (`src/shared/background-state-format.js`), l'API et les canaux restent plats (`src/shared/state-wire.js`)
- Le **cycle de vie des serveurs** — `server/lifecycle/start-stream.js`, `server/lifecycle/supervisor.js`, `server/lifecycle/stop-servers.js`, `server/lifecycle/kill-servers.js`,
  routes `/control/*` du serveur d'état : tout changement passe `server/lifecycle/lifecycle.test.js` (vrais processus, ports d'essai
  attribués par le système, jamais 5931/5932). Une doublure ne prouve pas qu'un port est libéré.

- **Essais de bout en bout** — `bun e2e/run.js` (ou `--only <suite>`, `--shots <dossier>`) : le Studio dans un vrai Chrome, avec de vrais serveurs
  sur des ports d'essai et de vrais événements d'entrée (souris, clavier, glisser), sans aucune dépendance (protocole CDP par la WebSocket de
  Bun). Toute modification du Studio (panneaux, éditeur, aperçu) la passe ; une classe de défaut d'interface trouvée à la main y repart en contrôle.

Modifier l'une de ces surfaces impacte tous les effets : vérifier en aval avant d'éditer.

---

## Git — un seul fil

Dépôt solo, un seul développeur : **`main` est la seule branche**, locale comme distante.
Cette règle prime sur les workflows génériques (worktree, branche de feature, PR) du CLAUDE.md
global.

- Travailler et committer directement sur `main`, un commit par changement logique.
- **Pousser en fin de lot**, une fois `bun test` vert : `main` et `origin/main` ne doivent jamais
  rester décalés d'une session à l'autre.
- Pas de branche de feature, pas de PR, pas de worktree — sauf demande explicite de l'owner.
- Ce qui est retiré du dépôt mais doit rester récupérable est **taggé** (ex. `scene-engine-v1`),
  jamais gardé sur une branche parallèle. Un tag est poussé avec le commit qui le retire.

---

## Agent skills

### Issue tracker

GitHub Issues sur `W-D0n/overlay`, via `gh` CLI. Voir `docs/agents/issue-tracker.md`.

### Triage labels

Labels canoniques par défaut (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Voir `docs/agents/triage-labels.md`.

### Domain docs

Single-context — un `CONTEXT.md` + `docs/adr/` à la racine, créés à la demande par `/domain-modeling`. Voir `docs/agents/domain.md`.
