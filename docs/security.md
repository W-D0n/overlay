# Sécurité — Overlay Stream

> Document requis pour la diffusion publique du projet (FRIC-S2-04, `docs/specs/scene-config-protocol.md`
> §Sécurité). Consolide le modèle de menace S2 + les mesures livrées en S4.

## Modèle de menace

| Surface | État |
|---|---|
| `ws://localhost:4456` (relais → overlay) | Trafic local par défaut. Connexion WS authentifiée par token (`?token=`), sinon `close(1008)` immédiat. |
| `ws://localhost:4455` (relais → OBS) | Trafic local. Auth SHA256 native du protocole OBS WebSocket v5 si un mot de passe OBS est configuré. |
| `POST /emit` | Authentifié par secret partagé (`Authorization: Bearer <secret>`), sinon `401`. Limité à 20 req/10s par IP (`relay/rate-limiter.js`), au-delà `429`. |
| Messages `{type,data}` entrants (côté overlay) | Validés par `reduceMessage` (logique pure, testée) : type inconnu ignoré, valeurs hors domaine (`scene`, `level`, `transition.type`) → rejetées avec warning, jamais d'état illégal appliqué. |
| `morph.trigger` | CustomEvent local uniquement, aucune sortie réseau. `imageUrl` (couche 3A, non implémentée) devra être restreinte aux assets locaux du projet — jamais une URL arbitraire fournie par un message externe (risque SSRF/exfiltration), à appliquer dès l'implémentation de cette couche. |
| Stockage | Aucun secret dans le code versionné. `obs-config.local.js` (token overlay↔relais) et les variables d'env (`OBS_WS_PASSWORD`, `OVERLAY_RELAY_SECRET`) sont exclus de git (`.gitignore`). |

## Règles à respecter en exploitation

1. **Ne jamais exposer le relais sur une interface réseau publique.** `RELAY_PORT` (4456) et le port
   OBS WebSocket (4455) doivent rester `localhost` ou un réseau privé de confiance — le relais n'a
   pas été conçu pour être exposé publiquement (pas de TLS, auth par secret partagé simple).
2. **Un viewer ne doit jamais piloter l'overlay.** Aucune entrée chat brute ne doit alimenter
   directement `POST /emit`, `scene.set` ou `morph.trigger` — toute intégration future (bot Twitch,
   EventSub) doit filtrer/valider côté intégration avant d'appeler `/emit`, jamais faire suivre du
   texte utilisateur tel quel.
3. **Secrets : générer, ne jamais coller en clair dans un canal partagé** (chat, ticket, log
   partagé). Si un secret (`OBS_WS_PASSWORD`, `OVERLAY_RELAY_SECRET`/`RELAY_TOKEN`) a été exposé par
   erreur (ex. collé dans une conversation), le régénérer immédiatement — un secret vu une fois par
   un tiers doit être considéré compromis, même localement.
4. **`obs-config.local.js` ne doit jamais être commité.** Vérifié par `.gitignore` — en cas de doute,
   `git check-ignore -v obs-config.local.js` doit retourner une correspondance.
5. **Rotation** — pas de mécanisme de rotation automatique des secrets (hors scope S4). Rotation
   manuelle : régénérer la valeur, mettre à jour `obs-config.local.js` et la variable d'env
   `OVERLAY_RELAY_SECRET` au prochain lancement du relais.

## Hors scope (connu, non implémenté)

- **TLS** — le relais tourne en `ws://`/`http://` non chiffré. Acceptable en `localhost`/réseau privé
  de confiance ; **bloquant** si le relais devait un jour être exposé au-delà (à traiter avant toute
  ouverture réseau publique).
- **Rotation automatique / expiration des secrets.**
- **Rate-limiting sur la connexion WS overlay** (seul `/emit` est limité) — risque jugé faible : la
  connexion WS n'accepte qu'une lecture (diffusion relais → overlay), pas d'action déclenchée par un
  client WS entrant.
- **Audit log** des appels `/emit` (qui a émis quoi, quand) — pas de besoin identifié tant que l'usage
  reste un seul owner local.
