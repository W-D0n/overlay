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
   `{ el, update?(data), destroy?() }`. Voir `components/index.js`.
5. **Configuration hors composant** — données statiques qui pilotent un composant (couches d'une
   scène, items de nav, options) → fichier `*.config.js` dédié, jamais en dur dans le composant.
6. **Communication par messages `{ type, data }`** — le store consomme un protocole abstrait, sans
   connaître la source. Indépendance = protocole, pas absence de connexion. Voir `{overview}`.
7. **Transparence dynamique** — la visibilité (full / minimal / hidden) est un état orthogonal à la
   scène, géré via couches nommées (`data-layer`). Voir `{overview}`.

---

## Shared surfaces — à vérifier avant tout changement

- `tokens.css` — touché par toutes les scènes
- `store.js` — protocole `{ type, data }` consommé par toutes les scènes
- `types.js` — types JSDoc partagés
- `components/index.js` — composants réutilisés
- Le **format de config de scène** — spécifié dans `docs/specs/scene-config-protocol.md`

Modifier l'une de ces surfaces impacte plusieurs scènes : vérifier en aval avant d'éditer.
