# Inbox — Overlay Stream

Capture d'idées et questions ouvertes. Trier via `/inbox-triage`.

---

## dotgrid-tuner — persistance des paramètres (demande owner, 2026-07-03)

`dev/dotgrid-tuner.html` (jalon 1 réduit au DotGrid, voir §Éditeur ci-dessous) ne fait que copier le
`MODE_PARAMS` généré dans le presse-papiers — l'owner colle et sauvegarde lui-même dans
`components/DotGridAnimated.js`. Demande : que la sauvegarde devienne persistante (pas de
copier-coller manuel).

**Question ouverte à trancher avant implémentation** — où écrire :
- **Fichier local via un petit serveur d'écriture** : `relay/server.js` (déjà existant, S4) pourrait
  exposer une route `POST /dev/dotgrid-params` qui réécrit `components/DotGridAnimated.js` (ou un
  fichier de config séparé importé par lui) sur disque. Danger : mélange un outil de *dev* dans le
  process de *prod* (le relais tourne pendant le stream) — probablement un serveur de dev séparé
  serait plus propre (`bun dev/tuner-server.js`, jamais lancé en live).
- **`localStorage` navigateur** : zéro backend, mais persistance locale au navigateur seulement (pas
  écrit dans le fichier source → désynchronisation avec `DotGridAnimated.js`, confusion possible).
- Aligner avec le jalon 1 de l'éditeur (`docs/inbox.md` §Éditeur) : ce jalon prévoyait déjà l'écriture
  de `SceneConfig` — la persistance DotGrid pourrait suivre le même mécanisme plutôt qu'un système
  séparé, une fois ce mécanisme choisi.

Non implémenté cette session (nécessite une décision d'architecture + probablement une petite spec) —
voir CLAUDE.md §Ambiguity Protocol.

---

## Éditeur d'overlay — un seul outil construit par incréments

**Décision (grill-me session A) :** il n'y a **pas** deux artefacts ("toolset de dev" + "éditeur").
Il y a **un seul outil — l'éditeur — construit par jalons successifs**. Le "toolset modeste" initial
est simplement le **jalon 1** de l'éditeur, pas un projet distinct. Un seul format de config, un seul
outil pour l'éditer, qui mûrit. Motivation : besoin de maîtrise et de souplesse de l'owner +
éviter la duplication de deux outils qui se recouvrent.

Le socle est l'architecture en cours (couches nommées, config externe sérialisable, protocole
`{ type, data }`, niveaux de visibilité, positionnement anchor+offset). L'éditeur est "juste" une UI
qui écrit cette config au lieu de l'écrire à la main.

### Jalons (du proche au lointain)

**Jalon 1 — Placement (PROCHE, après la base technique)**
Charger une config de scène, voir le rendu réel, déplacer un widget en drag & drop, lire/copier
les nouvelles valeurs `anchor` + `offset`. Débloque le workflow design (édition à la main = boucle
qui tue la dynamique, profil TDAH). C'est l'ancien "toolset `dev.html`", désormais cadré comme
jalon 1 de l'éditeur. **Prérequis :** format de config + système anchor/offset + chargement existants.

**Jalons suivants (épopée, plus tard) :**
- Gestion des couches (ajouter/nommer/réordonner z-index)
- Mapper la visibilité de chaque couche par niveau (full / minimal / hidden)
- Création / nommage de scènes
- Cocher (checkbox) les composants inclus dans chaque couche
- Sliders paramètres Simplex / mode DotGrid, déclenchement `trigger()`
- Bibliothèque de transitions (fade, slide, morph DotGrid via `morphTo()`)
- Binding de données par composant (ex : ce StatBlock → `state.viewers`)
- Export / import JSON de la config (cœur de l'indépendance)

**Garde-fou :** on conçoit le **format de config** comme si l'éditeur complet existait, mais on ne
construit que le jalon nécessaire au besoin courant (`zero preemptive code`). Au-delà du jalon 1,
la config reste écrite à la main jusqu'à ce qu'un besoin concret justifie le jalon suivant.

### Extension — Contrôle OBS centralisé (S6, priorisé par l'owner, 2026-07-03)

**Demande explicite de l'owner** en session (2026-07-03), après avoir testé le pipeline OBS↔relais↔overlay
en conditions réelles : « j'aimerai bien pouvoir tout faire d'un seul endroit ». Élève cette extension
(déjà envisagée dès la session A) au rang de session cadrée (S6, `docs/MAP.md`), dépendante de S5.

OBS WebSocket v5 est **bidirectionnel** : au-delà d'écouter les événements, le client peut envoyer
des requêtes qui modifient OBS (créer scènes, créer/placer sources, transformer position/taille,
activer/désactiver visibilité, configurer filtres et transitions, définir la scène active).

→ Le panneau de contrôle unique (S5 jalon 1 + S6) deviendrait le **seul endroit** où l'owner :
- place/ajuste les widgets de l'overlay (jalon 1, `anchor`/`offset`) ;
- règle les paramètres DotGrid par mode (`dev/dotgrid-tuner.html`, avec persistance résolue, voir
  item ci-dessus) ;
- crée/pilote les scènes OBS elles-mêmes (`CreateScene`, `SetSceneItemTransform`, activer une
  scène) — sans repasser par l'UI native d'OBS pour ces opérations.

L'overlay (fond animé + widgets) devient une des sources qu'OBS compose ; le panneau programme cette
composition plutôt que de l'exiger manuelle. S'aligne avec le recentrage C (OBS fait le compositing,
le panneau le programme).

**Prérequis technique :** S5 doit exister en premier — le contrôle OBS a besoin d'un panneau où
s'afficher, pas de sens en tant qu'endpoint isolé.

**⚠ À vérifier avant implémentation :** noms exacts des requêtes OBS WS v5 (`CreateScene`,
`SetSceneItemTransform`, etc.) et leurs payloads — non vérifiés contre la doc officielle du
protocole. Principe confirmé, détails à valider en S6.

**Question ouverte** (à trancher au cadrage S6) : le panneau tourne-t-il comme extension du relais
`relay/server.js` (déjà connecté à OBS WS v5, réutilise la connexion existante) ou comme process
séparé qui ouvre sa propre connexion OBS WS v5 ? Le relais tourne pendant tout le live — y ajouter
des capacités d'écriture (créer/modifier des scènes) élargit sa surface pendant le direct ; un
process de contrôle séparé, lancé à la demande hors-live, serait plus prudent. À trancher avec
l'owner avant d'écrire le premier `CreateScene`.

---

## Skill local — recherche graphique d'overlay

**À créer :** un skill **attaché à ce projet** (`.claude/` du projet, pas global) qui cadre les
sessions de recherche graphique / design d'overlay, pour que leurs outputs soient cohérents et ne
cassent ni le travail actuel ni les sessions futures.

Contraintes/règles que le skill doit imposer (à affiner) :

- **Output = config, pas image.** Toute proposition de composant est livrée dans le **format de
  config figé** (`anchor` + `offset`, couche, mode DotGrid associé), chargeable immédiatement et
  modifiable ensuite dans l'éditeur — jamais une maquette opaque à reconstruire.
- **Respecter le format de config gelé** (à documenter dans la spec avant les sessions design).
- **Respecter `tokens.css`** comme source de vérité design — pas de couleur/typo/espacement hors token.
- **Respecter le recentrage C** : l'overlay = fond animé + widgets data-driven dans UNE source ;
  ne pas proposer de composition qui suppose plusieurs Browser Sources ou du compositing OBS.
- **Respecter zero-build / zero-dépendance.**
- **Ne pas inventer de widget hors du pattern composant** `{ el, update?, destroy? }`.

**Prérequis :** le schéma de config doit être figé et documenté AVANT d'écrire ce skill, sinon il
n'a pas de format à imposer.

---

## Tâche externe — MyVault : rejeu grill-me sur spec

Ajouter dans MyVault un mécanisme qui **rejoue les questions du grill-me** sur une spec existante
pour détecter les trous non couverts. (Variante active, pas simple cross-check.)
N'appartient pas à ce projet — à reporter dans l'inbox de MyVault.

---

## DotGrid — visibilité et rythme ajustés (résolu, session 2026-07-03)

Ajustement direct dans `components/DotGridAnimated.js` (pas d'éditeur — jalon éditeur toujours pas
construit, ajustement documenté ici comme prévu) :
- `baseOpacity` 0.18 → 0.26, `dotRadius` 0.7 → **1.3** (2 passes, validées visuellement par l'owner).
- Couche 1 (oscillation individuelle) : amplitude et vitesse augmentées (~+50-60%).
- Couche 2 (Simplex par mode) : `freqT` et `amplitude` augmentés ~1.5-2× par mode dans `MODE_PARAMS`,
  écarts relatifs conservés entre scènes calmes (`codage`) et dynamiques (`react`).

Confirmé fonctionnel en preview navigateur 1920×1080 par l'owner. Vérification OBS native encore
à faire avant le premier live (comme le reste des scènes S3b).

---

## HUD scène `jeu` — lisibilité résolue + viewers retiré partout (résolu, 2026-07-03)

Confirmé trop petit **en Browser Source OBS réelle** (pas juste un effet de zoom navigateur).
Root cause : `--text-xs` valait **7px** (`tokens.css`) — bug de source de vérité design affectant
tous les libellés uppercase de toutes les scènes, pas un cas isolé à `jeu`. Corrigé à `13px`.

En même temps, décision owner : le compteur de viewers est **retiré de tout l'overlay** (métrique
jugée plus stressante qu'utile en live), y compris le récap post-stream `VIEWERS MAX` de `fin` —
cohérence totale demandée, pas seulement en direct. `state.viewers` reste dans le modèle de données
(`store.js`/`protocol.js` inchangés), seul l'affichage a été retiré des scènes concernées.

Vérifié visuellement par l'owner en preview navigateur après la correction.

---

## Scène `creation` — variante B (panneau référence) abandonnée en page-unique (S3b)

L'ancien `Creation3D.html` gérait 2 variantes via `?mode=A|B` sur **2 Browser Sources séparées**
pointant la même page (A : capture + widgets ; B : capture + panneau référence + widgets réduits).
En page-unique (1 seule Browser Source pour tout l'overlay), ce mécanisme par paramètre d'URL +
2 sources n'a plus de sens — il faudrait un concept nouveau (2e scène, ou layer conditionnel piloté
par l'état live) pour le reproduire.

**Décision S3b (zero preemptive code, pas de réponse owner obtenue en session) :** seule la
variante A a été portée (`scenes/creation.config.js`). La variante B n'a pas été migrée.

**Si le besoin revient**, options déjà identifiées (à trancher avec l'owner) :
- Scène distincte `creation-ref`, sélectionnable comme n'importe quelle autre scène.
- Layer `reference` dans la scène `creation`, visibilité pilotée par l'état live
  (ex. `state.showReference`) plutôt que par l'URL.

---
