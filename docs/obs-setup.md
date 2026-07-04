# Configuration OBS — Browser Source + relais

> Deux étapes pour un lancement complet : (1) afficher l'overlay dans OBS, (2) démarrer le relais
> pour les changements de scène live + l'injection de données externes. Sans (2), l'overlay tourne
> en mode fallback statique (§Sans relais plus bas) — suffisant pour streamer avec l'habillage
> visuel seul.
>
> **Une fois la config faite une première fois** (§4.2), le lancement quotidien se résume à un
> double-clic sur `start-stream.bat` — voir §0.

## 0. Lancement quotidien — `start-stream.bat` / `start-dev.bat`

Deux scripts, deux usages **distincts** — ne pas les confondre :

- **`start-stream.bat`** — pour streamer. Lance serveur statique + relais uniquement. C'est celui
  à utiliser en live.
- **`start-dev.bat`** — pour une session de réglage (DotGrid, placement). Lance serveur statique +
  relais + les 2 serveurs d'écriture de dev (`tuner-server.js`, `placement-server.js`) + ouvre 3
  onglets automatiquement (preview avec auto-reload, tuner DotGrid, panneau de placement).
  **Ne jamais lancer pendant un live** — les serveurs de dev écrivent sur disque, pas faits pour
  tourner en continu pendant un stream.

Un double-clic sur le bon script après la config initiale (§4.2, une seule fois). Si `.env` est
absent, les deux scripts préviennent au lieu de planter silencieusement.

Les sections 1 à 4 ci-dessous détaillent ce que font ces scripts, et servent de référence
pour la config initiale ou en cas de problème (le lire une fois suffit).

## 1. Servir la page localement

Zero-build, mais OBS Browser Source a besoin d'une URL `http://` (pas `file://`, certaines APIs DOM
échouent en `file://`). Servir le dossier du projet avec Bun :

```bash
bunx serve -l 5500 .
```

Depuis la racine du repo (`C:\DEV\overlay`). Laisser tourner pendant tout le stream — c'est un
process séparé d'OBS, à démarrer avant d'ouvrir OBS (ou à relancer si le PC redémarre).

Vérifier que ça répond : `http://localhost:5500/index.html` doit afficher l'overlay (fond noir +
grille de points) dans un navigateur classique avant de le brancher à OBS.

## 2. Ajouter la Browser Source dans OBS

Dans la scène OBS où l'habillage doit apparaître :

1. **Sources → + → Navigateur (Browser Source)**
2. Nouvelle source, nom libre (ex. `Overlay Atelier`)
3. Renseigner :
   - **URL** : `http://localhost:5500/index.html`
   - **Largeur** : `1920`
   - **Hauteur** : `1080`
   - **FPS personnalisé** : laisser la valeur par défaut (30 suffit, l'animation DotGrid tourne en JS, pas en dépendance du FPS de capture)
4. **Décocher** « Actualiser le navigateur quand la scène devient active » — le DotGrid doit rester
   une instance continue (pas de reload à chaque changement de scène OBS, cf. `docs/overview.md`
   §Couche de fond DotGrid).
5. **Décocher** « Arrêter la source si non visible » — sinon les composants perdent leur état/timers
   quand la source est masquée par une autre scène OBS.
6. Placer la source **par-dessus** vos autres captures (webcam, capture d'écran) dans l'ordre des
   calques OBS — l'overlay est conçu pour être au premier plan (widgets + grille), pas en fond.

## 3. Vérification visuelle avant stream

Repasser sur chaque scène de l'overlay (`discussion`, `brb`, `codage`, `jeu`, `interview`, `react`,
`creation`, `fin`) au moins une fois en conditions réelles OBS 1920×1080 avant le premier live —
la vérification de cette session (S3b) s'est arrêtée à `bun test` (voir gap tracé dans
`docs/MAP.md` / `docs/handoffs/handoff-latest.md`), pas de vérification visuelle en navigateur.

Pas de mécanisme de changement de scène depuis OBS pour l'instant (voir limite ci-dessous) : pour
prévisualiser une scène donnée, il faut déclencher l'événement `overlay:scene-change` manuellement
depuis la console DevTools du Browser Source OBS (clic droit → Interagir, ou depuis un navigateur
classique sur `localhost:5500`) :

```js
document.dispatchEvent(new CustomEvent('overlay:scene-change', { detail: { scene: 'discussion' } }));
```

## 4. Démarrer le relais (S4 — changement de scène live)

Le relais (`relay/server.js`, `docs/specs/relay-bun-s4.md`) fait deux choses : (a) se connecte à
OBS en client WS v5 et traduit les changements de scène OBS en `scene.set` pour l'overlay, (b)
expose `POST /emit` pour pousser manuellement `{type,data}` (viewers, chat, alertes…) — aucune
intégration Twitch n'est branchée dessus pour l'instant, c'est juste le point d'entrée.

### 4.1 Activer le WebSocket dans OBS

`Outils → WebSocket Server Settings` → activer le serveur (port par défaut `4455`), noter le mot
de passe si l'authentification est activée (recommandé).

### 4.2 Configurer les secrets (une seule fois)

Deux fichiers de config locale, tous deux **gitignorés** — un secret, deux endroits car le relais
(process Bun) et l'overlay (code navigateur) ne lisent pas les mêmes mécanismes de config :

```bash
cp obs-config.example.js obs-config.local.js
cp .env.example .env
```

- **`obs-config.local.js`** (lu par le navigateur, `store.js`) : renseigner `RELAY_TOKEN` (chaîne
  aléatoire de votre choix — c'est le secret partagé avec le relais).
- **`.env`** (lu automatiquement par Bun au lancement de `relay/server.js`, sans rien à exporter
  manuellement) : renseigner `OBS_WS_PASSWORD` (mot de passe OBS WS) et `OVERLAY_RELAY_SECRET`
  (**exactement la même valeur** que `RELAY_TOKEN` ci-dessus — sinon la connexion overlay↔relais
  est refusée).

### 4.3 Lancer le relais

Une fois `.env` renseigné, `start-stream.bat` (§0) suffit. Pour lancer manuellement :

```bash
bun relay/server.js
```

(Bun charge `.env` automatiquement — pas besoin de préfixer la commande avec les variables.)

Variables d'environnement (voir `docs/specs/relay-bun-s4.md` §Comportements) :

| Variable | Défaut | Rôle |
|---|---|---|
| `OBS_WS_URL` | `ws://localhost:4455` | Où le relais se connecte à OBS |
| `OBS_WS_PASSWORD` | (vide) | Mot de passe OBS WS (si auth activée côté OBS) |
| `OVERLAY_RELAY_SECRET` | **requis** | Secret partagé avec `obs-config.local.js` — le relais refuse de démarrer sans |
| `RELAY_PORT` | `4456` | Port d'écoute du relais pour l'overlay (WS + `/emit`) |

Le relais log `[relay] connecté à OBS WebSocket` puis `[relay] OBS identifié`. Changer de scène
dans OBS doit alors changer la scène affichée par l'overlay (si les noms de scènes OBS sont dans
`relay/obs-scene-map.js` — à adapter à vos noms réels de scènes OBS, voir le fichier).

À démarrer **avant** OBS (ou après — le relais retente la connexion OBS toutes les 3s tant qu'elle échoue).

### 4.4 Injecter des données externes

```bash
curl -X POST http://localhost:4456/emit \
  -H "Authorization: Bearer <OVERLAY_RELAY_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"type":"viewers.update","data":{"count":42}}'
```

Types de messages acceptés : voir `docs/specs/scene-config-protocol.md` §Format de données.

## Sans relais — mode fallback statique

Si le relais n'est pas lancé (ou `obs-config.local.js` absent), l'overlay bascule automatiquement
en mode fallback : `viewers`, `chat`, `alertes`, `guest`, etc. restent aux valeurs par défaut
(`STATIC_FALLBACK` dans `store.js`), seule la **durée** avance via une minuterie locale. Suffisant
pour streamer avec l'habillage visuel seul (bandes dorées, grille de points, structure de scène),
sans changement de scène ni données live.
