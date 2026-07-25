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
2. **OBS Browser Source 1920×1080** — résolution fixe, `pointer-events: none`.
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
- `component-names.js` / `component-registry.js` — vocabulaire et factories des effets de fond
- `dev/component-field-schemas.js` — formulaires générés du tuner
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
