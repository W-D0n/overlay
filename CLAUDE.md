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
   Typage : `bun dev/typecheck.js` (TypeScript sur les JSDoc `// @ts-check`, `tsconfig.json` strict) ;
   la dette connue est figée par fichier dans `dev/typecheck-baseline.json` et ne peut que baisser.
2. **Résolution de la source OBS = un paramètre, pas une constante du code** — la source de référence est
   aujourd'hui 1920×1080 (le 2560×1440 posé le 2026-07-25 posait des problèmes avec certaines scènes et
   sources OBS ; le 1440p reste possible plus tard). Elle est déclarée **une seule fois** dans
   `render-reference.js` ; l'aperçu, les vignettes et le branding la lisent de là, la page de rendu épouse
   sa source et ne fige aucune dimension. Aucun autre fichier source n'écrit 1920 ni 1080 (garde : `dev/render-reference.test.js`) ;
   les positions et tailles de couches se stockent en **fractions** du canvas. `pointer-events: none`.
   Les interfaces de dev s'adaptent à l'écran (colonnes proportionnelles, empilement sous 1100 px, aperçu
   agrandi ou réduit) : aucune largeur de panneau ni aucun plafond de taille figé.
3. **Source de vérité design** — toutes les variables visuelles dans `tokens.css`. Jamais de valeur
   hardcodée dans un composant si un token existe.
4. **Pattern composant** — chaque composant est une fonction retournant
   `{ el, update?(data), destroy?() }`. Voir `components/*Background.js`.
5. **Configuration hors composant** — données statiques qui pilotent un composant (schémas de
   champs, items de nav, options) → fichier `*.config.js` dédié, jamais en dur dans le composant.
6. **Protocoles locaux explicites** — l'état du fond (`{ component, options }`) et les événements de
   réaction (`{ type, username?, amount? }`) sont consommés sans connaître leur source.
   Indépendance = protocole, pas absence de connexion. Voir `{overview}`.

---

## Shared surfaces — à vérifier avant tout changement

- `tokens.css` — touché par tous les effets et toutes les surfaces de dev
- `types.js` — types JSDoc partagés
- `layer-kinds.js` / `component-registry.js` — description (identifiants, libellés, capacités, champs) et fabriques des effets de fond
- `dev/component-field-schemas.js` — vue « formulaire » de `layer-kinds.js` pour le tuner
- Le **format d'état du fond** — spécifié dans `docs/specs/background-standalone.md`

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
