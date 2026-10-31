---
created: 2026-07-03
updated: 2026-10-31
---

# Sécurité — Overlay Stream

Modèle de menace de l'outil local (serveur statique + serveur d'état + client OBS WebSocket
lecture seule). Le relais et son authentification par jeton sont archivés avec le moteur de scènes.

## Surfaces

| Surface | Mesure |
|---|---|
| Écoute réseau | `127.0.0.1` uniquement (`LOOPBACK_HOST`, `dev/local-access-policy.js`). Les ports 5931 et 5932 sont injoignables depuis le réseau local. |
| Fichiers servis | Liste blanche : `components/`, `dev/` (hors `dev/data/`) et fichiers racine `html/js/css/json/png/svg/ico/woff2`. Dotfiles, `docs/`, `src-tauri/`, état persisté : 404. |
| Pages web tierces | Toute requête (HTTP ou WebSocket) dont l'`Origin` n'est pas locale reçoit 403 ; un `Host` non local aussi (anti DNS rebinding). |
| API d'état | Pas d'authentification : l'accès est réservé à la machine. Les entrées sont validées (`background-state-format.js`) avant écriture. |
| Images importées | `POST /assets` : le type est reconnu à l'en-tête du fichier (PNG, JPEG, GIF, WebP), jamais au nom ni au `Content-Type` du client ; **SVG refusé** (scripts et références externes) ; 15 Mo et 25 millions de pixels au plus, dimensions lues sans décoder ; identifiant = empreinte du contenu (aucun chemin n'est jamais construit depuis une entrée) ; servies avec `X-Content-Type-Options: nosniff`. Un lot importé (version 4) est contrôlé de même (type lu dans les octets décodés, 64 images et 128 Mo au plus) et une image dont l'empreinte ne correspond pas à son identifiant fait refuser le lot. Elles vivent à côté du fichier d'état, dans `dev/data/`, que le serveur statique ne sert pas. |
| OBS WebSocket | Client en lecture seule (scène active, liste des scènes). Le mot de passe vient de `.env` (ignoré par git), jamais servi ni journalisé. |

Tests : `dev/local-access-policy.test.js`, `dev/background-state-server.test.js` (Origin étrangère refusée), `dev/asset-format.test.js`, `dev/bundle-assets.test.js`, `dev/asset-routes.test.js` (faux fichier, fichier trop lourd, identifiant en forme de chemin, origine étrangère).

## Règles d'exploitation

1. Ne pas rediriger ces ports vers le réseau (proxy, tunnel, partage de port d'une VM) : l'API d'état n'a pas d'authentification.
2. Un mot de passe OBS ou un jeton vu par un tiers est à régénérer, même s'il n'a transité qu'en local.
3. Les événements entrants (alertes, chat) sont validés côté source avant d'atteindre `POST /event` ; jamais de texte utilisateur brut.
4. Avant l'ajout d'une source réseau (EventSub, relais cloud), ce document est à reprendre : chaque nouvelle surface a besoin d'une authentification.
