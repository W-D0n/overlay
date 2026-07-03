---
feature: relay-bun-s4
created: 2026-07-03
updated: 2026-07-03
status: draft
---

# Spec : relais Bun (S4)

## Contexte

`store.js` ouvre déjà une connexion WebSocket vers `ws://localhost:4455` et attend des messages
`{ type, data }` déjà au format du protocole (`docs/specs/scene-config-protocol.md`). Mais **rien
n'écoute** sur ce port aujourd'hui — l'overlay tourne toujours en mode fallback statique
(`docs/obs-setup.md` §Limite actuelle).

S4 construit ce relais : un process Bun local qui (1) parle le vrai protocole **OBS WebSocket v5**
côté OBS pour traduire les changements de scène OBS en `scene.set`, et (2) expose un endpoint HTTP
`POST /emit` authentifié pour qu'une source externe (bot Twitch, script MyVault, déclenchement
manuel) pousse `{type,data}` (viewers, chat, alertes, `scene.set`…) — décision validée avec l'owner
(2026-07-03) : pas d'intégration Twitch/EventSub construite dans cette session, seulement le point
d'entrée `/emit`.

## Périmètre

**Inclus :**
- Serveur Bun natif (`Bun.serve`, zéro dépendance npm) : WS pour l'overlay + HTTP `/emit`.
- Client OBS WebSocket v5 : handshake `Hello`/`Identify` avec auth SHA256 (si mot de passe OBS
  configuré), écoute `CurrentProgramSceneChanged`, traduction vers `scene.set` via une table de
  correspondance nom-de-scène-OBS → `SceneId` overlay.
- Auth simple : secret partagé (`OVERLAY_RELAY_SECRET`, variable d'env) vérifié sur `/emit`
  (header `Authorization: Bearer <secret>`) et sur la connexion WS overlay (query param `?token=`).
- Changement de port overlay : `ws://localhost:4455` (OBS lui-même) est déjà pris par OBS →
  le relais écoute pour l'overlay sur un **port différent** (`4456` par défaut, `RELAY_PORT`).
  `store.js` `WS_URL` est mis à jour en conséquence.

**Exclu (sessions futures) :**
- Intégration Twitch EventSub/chat réelle (qui appellerait `/emit`) — hors scope, juste le endpoint.
- Rate-limiting sur `/emit` (FRIC-S2-04, séquencé avec la publication publique).
- Contrôle programmatique d'OBS (créer scènes, transformer sources) — épopée éditeur, hors scope.
- `morph.trigger` / couche 3A DotGrid — hors scope de ce relais.

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | Le relais démarre sans crasher si `OBS_WS_PASSWORD` absent et qu'OBS n'a pas d'auth activée | test manuel |
| AC-02 | Le relais calcule l'auth SHA256 OBS WS v5 conformément au protocole officiel (base64(sha256(base64(sha256(password+salt))+challenge))) | test unitaire (fonction pure) |
| AC-03 | `mapObsSceneToOverlaySceneId` retourne le `SceneId` mappé pour un nom OBS connu, `null` pour un nom inconnu (jamais de crash) | test unitaire |
| AC-04 | `POST /emit` sans header `Authorization` valide → `401`, aucun message diffusé | test manuel (curl) |
| AC-05 | `POST /emit` avec secret valide et body `{type,data}` valide → diffusé à tous les clients WS overlay connectés | test manuel |
| AC-06 | Connexion WS overlay sans `?token=` valide → connexion refusée (close immédiat) | test manuel |
| AC-07 | `CurrentProgramSceneChanged` OBS avec un nom de scène absent de la table de correspondance → log warning, aucun message diffusé (pas de `scene.set` avec une valeur invalide) | test manuel + AC-03 |
| AC-08 | `store.js` pointe sur le nouveau port (`4456`) et inclut le token dans l'URL de connexion | review code |

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Format de données

```js
// relay/obs-scene-map.js — config statique, éditable sans toucher au code
export const OBS_SCENE_MAP = {
  'Discussion': 'discussion',
  'BRB': 'brb',
  'Codage': 'codage',
  'Jeu': 'jeu',
  'Interview': 'interview',
  'React': 'react',
  'Creation': 'creation',
  'Fin': 'fin',
};
```

Noms de scènes OBS = **exemples** ; l'owner doit les aligner sur les noms réels de ses scènes OBS
(pas de convention imposée côté OBS).

## Comportements

### Cas nominaux

1. Démarrage : le relais lit `OBS_WS_URL` (défaut `ws://localhost:4455`), `OBS_WS_PASSWORD`,
   `OVERLAY_RELAY_SECRET`, `RELAY_PORT` (défaut `4456`) depuis l'environnement.
2. Connexion sortante vers OBS : `Hello` → si `authentication` présent dans la réponse, calcule le
   secret SHA256 et répond `Identify` avec ; sinon `Identify` sans auth. Attend `Identified`.
3. Overlay se connecte en WS sur `ws://localhost:4456/ws?token=<secret>` — token vérifié à l'upgrade.
4. OBS change de scène → événement `CurrentProgramSceneChanged` → mapping → `scene.set` diffusé à
   tous les clients WS overlay connectés.
5. Un client externe autorisé `POST /emit` avec `{type,data}` → diffusé tel quel (le relais ne
   valide pas le *contenu* du message, seulement l'auth — la validation métier reste dans
   `protocol.js` côté overlay, déjà testée, AD-1 préservé : pas de dérive de la logique pure).

### Cas d'erreur

- OBS injoignable au démarrage → retry avec back-off (même pattern que `store.js`
  `connectWebSocket`, réutilisé côté relais), log une seule fois par changement d'état.
- `/emit` sans secret ou secret invalide → `401`, log warning (sans logger le secret reçu).
- WS overlay sans token valide → `close(1008, 'unauthorized')` immédiat après upgrade.
- Nom de scène OBS non mappé → warning loggé, rien diffusé (jamais de `SceneId` halluciné).

### Edge cases

- `OVERLAY_RELAY_SECRET` absent au démarrage → le relais refuse de démarrer (`process.exit(1)`)
  plutôt que de tourner sans auth silencieusement.
- Plusieurs clients WS overlay connectés simultanément (ex. preview navigateur + OBS Browser
  Source) → diffusion à tous, pas de session unique.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `relay/obs-scene-map.js` | créer | Table de correspondance + logique pure (AC-02, AC-03) |
| `relay/obs-scene-map.test.js` | créer | Tests `bun test` de la logique pure |
| `relay/server.js` | créer | Orchestration : `Bun.serve`, client OBS WS, effets (non testé unitairement, AD-1) |
| `store.js` | modifier | `WS_URL` → `ws://localhost:4456/ws?token=...` (secret en config locale, pas commité) |
| `docs/obs-setup.md` | modifier | Retirer la mention "mode fallback" une fois le relais opérationnel, ajouter section démarrage relais |
| `docs/MAP.md` | modifier | S4 → ✅ à la clôture |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — `store.js` ne doit pas commiter le secret en clair dans `WS_URL` si le projet est
      publié publiquement (repo public). Pour cette session (usage local D0n), le secret vit dans
      une variable d'environnement injectée au build/serve local ou dans un fichier non commité
      (`.env`, déjà dans `.gitignore` à vérifier) — **pas** codé en dur dans `store.js`. Si aucun
      mécanisme de config runtime n'existe pour l'injecter côté navigateur (fichier statique,
      pas de build), une solution simple : `RELAY_TOKEN` lu depuis un fichier `relay.config.js`
      local, ignoré par git, avec un `relay.config.example.js` commité comme gabarit.
