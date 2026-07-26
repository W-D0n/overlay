# Spec — Transition entre presets (④ de l'audit produit)

Statut : **livrée et validée en Browser Source réelle** (owner, 2026-07-26). Créée le 2026-07-25.

Décisions owner (2026-07-25) :

1. La transition est déclarée par le **preset entrant** — chaque preset décide comment il arrive.
2. Répertoire : **fondu** et **balayage** directionnel.

Besoin : aujourd'hui un changement de fond est un remplacement sec. Avec ③, ce remplacement se
déclenche tout seul à chaque changement de scène OBS — la coupure devient visible en live.

---

## Le problème central : distinguer un changement de preset d'un réglage

L'état diffusé (`current = { component, options }`) est le même que le fond change de preset ou que
tu bouges un curseur dans le tuner. Animer les deux serait insupportable : chaque cran de curseur
déclencherait un fondu d'une seconde.

**La transition elle-même sert de signal.** L'état diffusé gagne un champ optionnel :

```json
"current": {
  "component": "BubbleBackground",
  "options": { "count": 15 },
  "transition": { "type": "wipe", "durationMs": 600, "direction": "right" }
}
```

- `transition` **présent** → c'est une arrivée de preset : on anime.
- `transition` **absent** → c'est un réglage en cours : `update()` en direct, aucune animation.

Le tuner n'envoie donc jamais de `transition` quand il modifie un champ, et en envoie une quand tu
cliques sur un preset. Le mapping OBS (③) envoie celle du preset entrant. Aucune notion d'intention
implicite : ce qui déclenche l'animation est écrit dans l'état.

## Format

Sur un preset, à côté de `component` et `options` :

```json
"transition": { "type": "fade" | "wipe", "durationMs": 600, "direction": "right" }
```

| Champ | Valeurs | Défaut | Notes |
|---|---|---|---|
| `type` | `fade`, `wipe` | `fade` | `direction` ignoré si `fade` |
| `durationMs` | 0 à 2000 | `600` | 0 = coupure franche, bornée pour ne jamais bloquer un live |
| `direction` | `left`, `right`, `up`, `down` | `right` | Sens de recouvrement du nouveau fond |
| `easing` | `linear`, `easeIn`, `easeOut`, `easeInOut` | `easeInOut` | Courbe de l'animation (ajouté 2026-07-26 : l'owner veut régler plutôt que subir une règle) |

`transition` absent d'un preset = valeurs par défaut ci-dessus. Les presets déjà enregistrés
restent valides et arrivent en fondu de 600 ms.

## Rendu

Chaque effet est monté dans son propre calque plein écran (`position: absolute; inset: 0`) :

**Les deux calques sont animés, pas seulement l'entrant.** Les effets peignent sur des canvas
transparents : faire apparaître le nouveau ne fait pas disparaître l'ancien. Corrigé le 2026-07-26
après retour de l'owner (« la disparition est trop brutale, ça se voit beaucoup trop »).

- **fade** — fondu croisé : l'entrant va de l'opacité 0 à 1 pendant que le sortant va de 1 à 0.
  Mesuré : 0,83/0,17 → 0,13/0,87, somme constante.
- **wipe** — masque en **dégradé** dont la position est animée : la bande de fondu remplace le bord
  net, qui se lisait comme « un masque qui se déplace » (retour owner). Le sortant porte le dégradé
  **inversé à la même position** — pas le dégradé miroir, qui laissait les deux calques masqués du
  même côté (vérifié en teintant les calques).

Pendant la transition, **deux effets tournent simultanément** — c'est le coût de la fonctionnalité,
borné par `durationMs` (2 s maximum) et par le fait qu'une seule transition est en cours à la fois.

Une transition interrompue par une nouvelle (changement de scène rapide) : l'ancienne est terminée
immédiatement — le calque le plus récent gagne, les autres sont démontés. Jamais d'empilement.

`durationMs: 0` ou l'absence d'effet sortant (premier montage de la page) → application directe,
aucune animation : une Browser Source qui s'ouvre ne doit pas commencer par un fondu.

## Fichiers

| Fichier | Rôle | Nature |
|---|---|---|
| `background-transition.js` | Normalisation d'une transition (défauts, bornes) + styles de départ/fin par type | **Pur, testé** |
| `background-mount.js` | Montage en calques, exécution de la transition, démontage de l'ancien | Existant, étendu |
| `dev/background-state-format.js` | Validation de `transition` sur un preset et sur `current` | Existant, étendu |
| `dev/background-preview-session.js` / contrôleur | Envoi de `transition` au clic sur un preset, jamais sur un réglage | Existants, étendus |
| `dev/background-tuner.html` + contrôleur | Section « Arrivée de ce preset » (type, durée, sens) | Existants, étendus |
| `dev/background-state-server.js` | Le mapping OBS (③) joint la transition du preset entrant | Existant, étendu |

Les champs de transition **ne passent pas** par `BACKGROUND_FIELD_SCHEMAS` : ce ne sont pas des
options d'effet, ils appartiennent au preset. Les mélanger obligerait chaque effet à les déclarer.

## Logique pure (`background-transition.js`)

- `normalizeTransition(value)` → `{ type, durationMs, direction }` : valeurs inconnues ramenées aux
  défauts, `durationMs` borné à `[0, 2000]`, jamais d'exception.
- `transitionStyles({ type, direction })` → `{ from, to }`, deux jeux de propriétés CSS appliqués au
  calque entrant (opacité pour `fade`, `clip-path` pour `wipe`).
- `validateTransition(value)` → `ValidationResult` pour le format persisté (refus explicite, pas de
  correction silencieuse à l'écriture — la normalisation sert au rendu, la validation à l'écriture).

## Découpage en sessions atomiques

1. **Logique et format** — `background-transition.js`, `transition` validé dans le format d'état.
2. **Rendu** — calques et exécution dans `background-mount.js`, branchement `background.html` et
   aperçu du tuner. Le mapping OBS joint la transition du preset.
3. **Tuner** — section « Arrivée de ce preset », envoi de la transition au clic sur un preset et
   jamais sur un réglage.
4. **Vérification** en Browser Source réelle 2560×1440 + doc.

## Critères d'acceptation

1. `normalizeTransition` : absent, `null`, type inconnu, durée négative, durée > 2000, direction
   inconnue → valeurs par défaut ou bornes, jamais d'exception.
2. `validateTransition` : type hors liste, durée non numérique, direction inconnue → erreurs listées.
3. Un preset sans `transition` reste valide et arrive en fondu 600 ms.
4. État **sans** `transition` → `update()` appelé, aucun second calque créé (le cas du curseur).
5. État **avec** `transition` et composant différent → deux calques pendant la transition, un seul
   après, l'ancien `destroy()` appelé exactement une fois.
6. État avec `transition` et `durationMs: 0` → remplacement immédiat, aucun calque résiduel.
7. Premier montage de la page avec `transition` → aucune animation, aucun calque résiduel.
8. Transition interrompue par une autre → un seul calque à la fin, tous les autres `destroy()`.
9. Deux presets du **même** effet avec des options différentes → transition jouée (c'est une arrivée
   de preset, pas un réglage).
10. `bun test` vert + vérification visuelle en Browser Source réelle (owner, session 4).

## Hors périmètre

- Transition sonore ou synchronisée au son : la réactivité audio (②) est indépendante.
- Transitions par effet (un effet qui s'auto-anime à l'arrivée) : le calque est générique, il
  fonctionne avec les 11 effets sans code par effet.
- Enchaînement scénarisé de plusieurs presets : hors sujet, un changement à la fois.

## Lacunes assumées (LAC)

- **LAC-01** — Pendant la transition, deux effets tournent : sur un canvas 2560×1440, le coût est
  doublé pendant au plus 2 s. À surveiller lors de la QA OBS native, aucun garde-fou automatique
  (visibilité et contrôle manuel plutôt que correction silencieuse).
- ~~**LAC-02**~~ — Résolue par le fondu croisé : les deux opacités s'additionnent à 1 au lieu de
  dépasser, la surbrillance redoutée n'a pas lieu.
