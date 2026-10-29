---
created: 2026-10-29
updated: 2026-10-29
---

# Spec — Zéro installation, local-first

Statut : **Draft, à valider par l'owner**. Créée le 2026-10-29.

Besoin : faire tourner l'outil complet (Studio, tuner, fond OBS, réactions) avec **le moins de
dépendances et de contraintes système possible**, en gardant l'usage mono-utilisateur et
local-first, sans jamais risquer la stabilité d'un live.

> **Précision de l'owner (2026-10-29)** : « zéro installation » est une **intention, pas un critère
> absolu**. Il s'agit de réduire les dépendances et les contraintes liées au système, pas de les
> supprimer à tout prix. Conséquence : un exécutable local (T1) suffit largement ; le relais cloud
> (T3) perd sa principale justification et reste une option de confort, pas un objectif.

## Décisions owner (2026-10-29)

| Sujet | Décision |
|---|---|
| Public | **Un seul utilisateur** (l'owner). Pas de comptes, pas de multi-tenant, pas de quotas. |
| Transports | **Local + cloud.** Le local est le défaut. Le cloud est **optionnel**, car il suppose de financer une infrastructure : rien n'est engagé tant que ce coût n'est pas chiffré et accepté. |
| Contrainte « zéro build, zéro dépendance » | **Exception acceptée**, limitée à l'outillage de packaging et de déploiement (`bun build --compile`, éventuellement `wrangler`). Le moteur de rendu et le code source de l'app restent natifs, sans build. |
| Tauri | **Indécis.** Traité en §Question ouverte : Tauri. Aucun engagement. |
| Stabilité du live | **Contrainte dure** : rien de ce spec ne place de charge ni d'état dans le processus OBS (voir §Pistes écartées). |

---

## Problème

Ce qui impose l'installation, c'est `dev/background-state-server.js` (Bun) : il persiste l'état et
les presets dans `dev/data/*.json`, diffuse en WebSocket (`/state-ws`, `/presets-ws`, `/event-ws`,
`/branding-ws`) et reçoit `POST /event`. Le rendu (`components/`, `background.html`, `tokens.css`) est
déjà du JS natif exécutable dans n'importe quel navigateur.

Les consommateurs du serveur ne passent pas tous par la même porte :

| Consommateur | Accès au serveur aujourd'hui |
|---|---|
| Tuner / Studio | `dev/background-state-client.js` (client unique, injectable : `fetchImpl`, `WebSocketImpl`) |
| `background.html` | `fetch` et `new WebSocket` **en direct** (lignes ~100–147) |
| Relais OBS WebSocket | `dev/obs-scene-client.js`, hébergé **dans** le serveur |

## Principe directeur

**Le rendu ne dépend jamais du transport.** Deux conséquences :

1. Le **protocole** est inchangé : l'état du fond `{ component, options }` et les événements
   `{ type, username?, amount? }` (`CLAUDE.md` §6). Seul ce qui les transporte change.
2. `background.html` conserve le **dernier état connu dans son propre stockage** et se rend depuis
   ce cache au démarrage, sans attendre de relais. Le relais n'apporte que les mises à jour. Un
   relais absent, lent ou tombé ne peut donc ni bloquer ni dégrader l'image : le fond reste sur le
   dernier état, ce qui est déjà l'invariant du projet.

```text
Studio ─┐                          ┌─ T1  Exécutable local (défaut)
        ├─► state-transport ───────┤
OBS bg ─┘   + cache local (bg)     └─ T3  Relais cloud (optionnel)
```

## Transports

### T1 — Exécutable local (défaut)

Le serveur actuel, empaqueté en un exécutable unique par `bun build --compile` : aucun runtime à
installer, un fichier à lancer. Il héberge aussi les fichiers statiques du Studio et de
`background.html`. C'est le transport qui porte la lecture de la scène OBS (`obs-scene-client.js`) et,
plus tard, les sources d'événements.

- La commande de développement (`bun run`) reste disponible : l'exécutable est un mode de
  distribution, pas un remplacement du flux de dev.
- Les ports restent ceux de `ports.config.js`, source unique.
- Où l'exécutable range ses données (à côté de lui ou dans `%APPDATA%`) est à trancher en phase 2.

> **À mesurer (phase 2), pas supposé** : que l'exécutable compilé serve correctement les assets
> statiques (embarqués ou placés à côté) et reproduise les routes du serveur actuel.

### T3 — Relais cloud (optionnel, non engagé)

Un Worker avec état, qui fait ce que fait T1 : conserver l'état courant et les presets, diffuser.
Le Studio devient alors un site statique. Une « room » identifiée par un jeton non devinable dans
l'URL de la Browser Source, sans compte.

- Seul chemin réellement sans installation, mais le critère n'étant pas absolu (voir plus haut),
  ce n'est plus une raison suffisante à lui seul.
- **Coût** : infrastructure à financer. **À chiffrer avant tout engagement** ; ce spec n'en donne pas
  d'estimation, faute de mesure.
- **Dépendance réseau pendant le live** : atténuée par le cache local du fond (§Principe directeur).
- **Limite structurelle** : un relais distant ne peut pas joindre l'OBS WebSocket local. La lecture de
  la scène active (`obs-scene-mapping`) exigerait alors un client local, par exemple la page Studio
  se connectant à `ws://127.0.0.1:4455`. Hypothèse à mesurer, non établie.
- C'est le seul endroit où l'exception « outillage de déploiement » s'applique.

## Pistes écartées

Consignées pour ne pas les réexaminer sans fait nouveau.

| Piste | Raison du rejet |
|---|---|
| **Dock de navigateur OBS** hébergeant le Studio | Le Studio et ses aperçus canvas tourneraient dans le processus d'OBS, en concurrence avec l'encodage du live. |
| **OBS WebSocket comme bus** (`BroadcastCustomEvent`, `SetPersistentData`) | Faire dépendre l'état du stream d'OBS lui-même, et charger son serveur WebSocket pendant le live. OBS WebSocket reste utilisé pour **lire la scène active**, comme aujourd'hui, et, exception à confirmer, pour **écouter en lecture seule** les `CustomEvent` de Twitchat (voir [`studio-cadrage`](studio-cadrage.md) §Twitchat). Aucun état n'y est stocké. |
| **`BroadcastChannel` / IndexedDB partagés** entre Studio et fond | Impossible entre un navigateur ordinaire et une Browser Source : celle-ci tourne dans le CEF d'OBS (Chromium embarqué, profil et stockage propres). |

## Cache local du fond

`background.html` écrit chaque état reçu dans le stockage de sa propre page et le relit au
démarrage. Contraintes :

- le stockage est lié à l'**origine** : le port de T1 (et, en cloud, le domaine) doit rester stable,
  sans quoi le cache est perdu ;
- un état en cache dont le preset a été supprimé côté source ne doit pas faire planter le rendu ;
- l'état reçu du transport l'emporte toujours sur le cache.

> **À mesurer (phase 1), pas supposé** : que le stockage d'une Browser Source OBS survive à un
> redémarrage d'OBS, et selon quels réglages de la source (« Arrêter la source quand elle n'est pas
> visible », « Actualiser quand la scène devient active »).

## Sources d'événements

Avec T1, elles vivent dans l'exécutable : les secrets restent côté processus local, dans
l'environnement ou le `.env` ignoré par git, comme `OBS_WS_PASSWORD` aujourd'hui.

| Source | Piste | Remplace |
|---|---|---|
| Événements Twitch | EventSub (transport WebSocket) géré par l'exécutable, qui appelle `POST /event` | Aucune intégration réelle aujourd'hui (`docs/roadmap.md` §Ensuite) |
| Scène OBS active | Inchangé (`obs-scene-client.js`, lecture seule) | — |
| Son du bureau | `getDisplayMedia` avec audio si le CEF d'OBS l'autorise, sinon périphérique de bouclage Windows | Capture micro seule |

> `getDisplayMedia` dans le CEF d'une Browser Source n'est pas établi. Repli : le périphérique de
> bouclage Windows, qui n'exige aucun code navigateur.

## Question ouverte : Tauri

Constat, mesuré dans `src-tauri/tauri.conf.json` : le shell ouvre `http://localhost:5931/dev/studio.html`.
Il **dépend du serveur Bun local** et ajoute lui-même une installation.

Ce qu'il apporterait que le navigateur n'apporte pas : raccourcis globaux (déclencher une réaction
sans alt-tab), notifications système (OBS déconnecté, chute de FPS), démarrage avec Windows.

Avec T1 en exécutable, Tauri change de rôle : il pourrait l'embarquer comme **sidecar** et devenir
l'enveloppe unique. Il faut alors justifier le coût de l'ensemble (toolchain Rust, WebView2) par
ces trois fonctions.

Position de ce spec : **ne pas engager Tauri, ne pas supprimer `src-tauri/`**. Décider après la
phase 2, avec ce critère : si les raccourcis globaux et les notifications manquent à l'usage réel,
Tauri devient une enveloppe facultative autour de T1 ; sinon `src-tauri/` est retiré et taggé
(règle « un seul fil » de `CLAUDE.md`). `src-tauri/` est aujourd'hui non suivi par git.

## Phasage

| Phase | Contenu | Sortie |
|---|---|---|
| **Prérequis** | Passer le QA OBS 1440p (`docs/inbox.md`), jamais fait | Base validée avant de migrer |
| **1 — `state-transport` + cache local** | Une interface unique derrière `background-state-client.js` ; `background.html` cesse d'appeler `fetch`/`WebSocket` en direct ; T1 réimplémenté derrière elle ; cache local du fond. Aucun changement de comportement visible. | Tests existants verts ; test de contrat de transport ; mesure du cache à travers un redémarrage d'OBS |
| **2 — Exécutable T1** | `bun build --compile`, service des assets, emplacement des données | Studio + fond OBS sans Bun installé |
| **3 — Sources d'événements** | EventSub, puis audio bureau, une source à la fois | Chacune prouvée en conditions réelles |
| **4 — Décision Tauri** | Selon le critère ci-dessus | `src-tauri/` gardé comme enveloppe ou retiré et tagué |
| **5 — Relais cloud T3** | **Seulement après** chiffrage du coût et accord explicite de l'owner | Second transport derrière la même interface |

La phase 5 n'a aucune dépendance descendante : les phases 1 à 4 se suffisent. Le seul prérequis
technique du cloud est l'interface de la phase 1, volontairement posée tôt.

## Critères de succès

Chacun doit être **observé**, pas déduit :

1. Studio et fond OBS échangent un changement de preset **sans Bun installé sur la machine**, via
   l'exécutable seul (vérifier le processus, puis l'effet à l'écran dans OBS).
2. Après arrêt du transport, `background.html` **reste affiché et inchangé** ; après redémarrage d'OBS
   transport arrêté, il se rend depuis son cache.
3. Le test de contrat de transport passe sur T1 et sur tout transport ajouté, et a été vu rouge sur
   une régression réinjectée (par exemple un message `state` non diffusé).
4. `bun test` reste vert à chaque phase ; la phase 1 ne modifie aucune assertion existante.
5. Rien de secret n'apparaît dans `git diff`, ni dans une URL de Browser Source (hors jeton de room T3,
   qui est révocable mais non confidentiel).

## Hors périmètre

- Comptes, OAuth multi-utilisateur, quotas, galerie publique de presets : exclus par la décision
  « un seul utilisateur ».
- Nouveaux effets de fond et nouveaux widgets : pistes dans `docs/pistes-enrichissement.md`, à
  traiter une fois ce socle posé et le QA passé.
- Aucune charge ni état dans OBS au-delà du rendu de `background.html` et de la lecture de scène.

## Risques

| Risque | Parade |
|---|---|
| Le stockage de la Browser Source ne survit pas aux redémarrages d'OBS | Mesure en phase 1 avant de dépendre du cache ; sinon le serveur reste requis au démarrage |
| L'exécutable compilé ne sert pas les assets comme le serveur actuel | Mesure en phase 2 ; le mode `bun run` reste disponible |
| Régression du live pendant la phase 1 | T1 conservé derrière l'interface ; bascule par configuration, pas par remplacement |
| Migration empilée sur une base non validée | QA 1440p en prérequis |
| Perte de données des presets au changement de stockage | Export/import existant (`/preview-import`, `/import-presets`) comme chemin de migration, vérifié par aller-retour |
| Coût du cloud non maîtrisé | Phase 5 conditionnée à un chiffrage et à un accord explicite |
