# Inbox — Overlay Stream

Capture d'idées et questions ouvertes. Trier via `/inbox-triage`.

---

## Extensions du système de placement (voulues par l'owner à terme, 2026-07-04)

Écartées de `docs/specs/scene-placement-protocol.md` (session 1/5 du panneau de contrôle S6) par
zero-preemptive-code — pas de besoin concret au moment de la spec. **Confirmé par l'owner : ce sont
des besoins réels, à faire à un moment**, donc tracées ici plutôt qu'oubliées. Chacune s'active
quand elle devient concrète (pas de calendrier fixé) — extension de `Placement`/`LayerConfig`,
pas une réécriture.

- **Redimensionnement par drag** — poignées de resize dans le panneau, en plus du déplacement.
  Étendrait le panneau (session 4/5) pour éditer `width`/`height` en live, pas seulement `x`/`y`.
  Design à faire : comment une poignée de resize communique la nouvelle taille au panneau (probablement
  même mécanisme que le drag de position, juste sur les coins/bords de l'élément).
- **Placement fin à l'intérieur d'une couche composite** — ex. la couche `cams` d'`interview`
  contient 3 éléments (cam gauche, filet, cam droite) positionnés indépendamment en CSS ; le modèle
  actuel ne déplace la couche que comme un bloc entier. Pour aller plus loin, il faudrait un
  sous-placement par élément dans `LayerConfig` (structure à repenser — pas juste ajouter un champ).
- **Repositionnement dynamique en cours de scène** (ex. une alerte qui glisse à l'écran via un
  événement) — `placement` actuel s'applique une seule fois au montage. Une version dynamique
  écouterait des changements d'état et réappliquerait le style à chaud.

---

## dotgrid-tuner — persistance résolue (S5, 2026-07-04)

Serveur de dev séparé (`dev/tuner-server.js`, `bun dev/tuner-server.js`, jamais lancé en live)
expose `POST /save`, réécrit directement `components/DotGridAnimated.js`. Logique de remplacement
extraite en module pur testé (`dev/dotgrid-params-format.js`). Bouton "Sauvegarder" dans
`dotgrid-tuner.html`, bouton "Copier" gardé en secours. Testé bout en bout manuellement.

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

**Jalon 1 — Placement (reporté, prérequis manquant constaté 2026-07-04)**
Charger une config de scène, voir le rendu réel, déplacer un widget en drag & drop, lire/copier
les nouvelles valeurs `anchor` + `offset`. Débloque le workflow design (édition à la main = boucle
qui tue la dynamique, profil TDAH). C'est l'ancien "toolset `dev.html`", désormais cadré comme
jalon 1 de l'éditeur.

**⚠ Prérequis non satisfait (constaté 2026-07-04) :** ce jalon suppose un système `anchor`+`offset`
dans `SceneConfig` — **ça n'existe pas**. AD-2 (S2) a explicitement mis le placement dans le
CSS/HTML par scène, pas dans une donnée sérialisable (zero preemptive code à l'époque, pas de
besoin concret pour une donnée de position). Un outil drag & drop n'a donc ni donnée à lire ni
mécanisme d'écriture aujourd'hui. Avant de reprendre ce jalon, il faut d'abord une session dédiée
de migration du placement vers `anchor`+`offset` (touche les 9 scènes) — non planifiée, à cadrer
avec l'owner quand le besoin de drag & drop redevient concret. **S5 a été réduite à la persistance
`dotgrid-tuner` seule** (item séparé ci-dessus) en attendant.

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
(déjà envisagée dès la session A) au rang de session cadrée (S6, `docs/MAP.md`), dépendante de S7
(panneau de placement, en cours — la numérotation S6/S7 a été clarifiée le 2026-07-04 : S7 est le
panneau lui-même, S6 le contrôle OBS qui s'y branche ensuite).

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
