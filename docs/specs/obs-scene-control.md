---
feature: obs-scene-control
created: 2026-07-06
updated: 2026-07-06
status: draft
---

# Spec : obs-scene-control (S6)

## Contexte

L'owner a exprimé le besoin de piloter OBS entièrement depuis le panneau de contrôle unique (S5/S7,
`dev/placement-panel.html`), sans repasser par l'UI native d'OBS : créer une scène OBS, l'activer,
positionner/masquer ses sources — voir `docs/inbox.md` §Contrôle OBS centralisé (demande explicite,
2026-07-03, priorisée). S8 (moteur de scène de l'éditeur) et S7 (panneau) sont livrés — ce chantier
était bloqué sur leur achèvement, débloqué maintenant.

`relay/server.js` a déjà, depuis une tranche livrée en avance (`/refresh-source`, 2026-07-04), le
mécanisme générique requête/réponse OBS WS v5 (`sendObsRequest`, opcode 6→7 apparié par
`requestId`) — cette spec l'étend, ne le réécrit pas.

**Décision d'architecture (owner, 2026-07-06)** : les routes de contrôle OBS vivent dans
`relay/server.js`, pas dans un process séparé. `relay/server.js` est le seul process conçu pour
tourner pendant le live (`start-stream.bat`) ; le besoin exprimé implique un usage **pendant** le
stream (basculer une scène OBS en direct depuis le panneau), pas seulement en préparation hors-live.
Un process séparé dupliquerait la connexion/auth/reconnexion OBS déjà écrite et testée ici — même
défaut qu'une race entre deux propriétaires non coordonnés d'un même état externe (voir
`docs/specs/scene-history-protocol.md` §Concurrence d'accès, cause corrigée dans un contexte
différent la même semaine). Le risque réel (surface d'écriture élargie pendant le direct) se traite
par rigueur (validation stricte, rate-limit, routes typées une par action — jamais de passthrough
générique `requestType` arbitraire, qui exposerait des requêtes dangereuses comme `ExitProgram`) et
non en fragmentant la connexion OBS.

Payloads des requêtes OBS WS v5 vérifiés contre le protocole officiel
(`github.com/obsproject/obs-websocket`, `docs/generated/protocol.md`) le 2026-07-06 — voir
§Comportements pour le détail par requête.

## Périmètre

**Inclus (vision complète du besoin, 4 sessions) :**
- Gestion de scènes OBS : lister, créer, activer (**session 1, livrée**).
- Gestion des scene items : lister, ajouter une source existante à une scène, positionner
  (`SetSceneItemTransform`), masquer/afficher (`SetSceneItemEnabled`) — **session 2, livrée**.
- UI panneau : nouvelle section dans `dev/placement-panel.html` consommant ces routes — session 3.
- Vérification end-to-end contre une vraie instance OBS — session 4, **bloquant** : `OBS_WS_URL`
  pointe une IP LAN (`ws://192.168.1.12:4455`, `.env`) injoignable depuis cet environnement ;
  vérification déléguée à l'owner ou nécessite un accès réseau à cette IP.

**Exclu (hors périmètre de ce chantier, pas juste différé) :**
- `CreateInput` (créer une nouvelle source, ex. Browser Source) — le besoin exprimé est de piloter
  des scènes/sources déjà existantes dans OBS (`CreateSceneItem` référence une source EXISTANTE par
  nom), pas d'en créer de nouvelles depuis le panneau. Zero preemptive code : aucun appelant concret.
- Suppression de scène/scene item OBS (`RemoveScene`, `RemoveSceneItem`) — pas demandé, risque élevé
  (destructif côté OBS) sans confirmation UI cadrée ; à spécifier séparément si le besoin apparaît.
- Passthrough générique d'une requête OBS WS v5 arbitraire — écarté explicitement (§Contexte),
  surface d'attaque non justifiée par un besoin concret.
- Transitions OBS (`SetCurrentSceneTransition`, etc.) — hors demande initiale.

## Acceptance Criteria — Session 1 (scènes)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `GET /obs/list-scenes` retourne la liste des scènes OBS (`GetSceneList`), 401 sans le secret partagé | manuel (faux serveur OBS WS v5) |
| AC-02 | `POST /obs/create-scene` `{ sceneName }` crée une scène OBS (`CreateScene`), 400 si `sceneName` absent/vide | manuel |
| AC-03 | `POST /obs/set-current-scene` `{ sceneName }` active une scène OBS (`SetCurrentProgramScene`), 400 si `sceneName` absent/vide | manuel |
| AC-04 | Les 3 routes exigent `Authorization: Bearer <OVERLAY_RELAY_SECRET>`, même contrat que `/emit`/`/refresh-source` — 401 sinon | manuel |
| AC-05 | Une requête OBS qui échoue (OBS déconnecté, `sceneName` déjà pris, etc.) retourne 502 avec le message d'erreur OBS, jamais un crash du process | manuel |

## Acceptance Criteria — Session 2 (scene items)

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-06 | `GET /obs/list-scene-items?sceneName=X` retourne les scene items de la scène (`GetSceneItemList`), 400 si `sceneName` absent | manuel (faux serveur OBS WS v5) |
| AC-07 | `POST /obs/create-scene-item` `{ sceneName, sourceName }` ajoute une source existante à une scène (`CreateSceneItem`), retourne `{ sceneItemId }`, 400 si l'un des deux champs est absent/vide | manuel |
| AC-08 | `POST /obs/set-scene-item-transform` `{ sceneName, sceneItemId, sceneItemTransform }` positionne un scene item (`SetSceneItemTransform`), 400 si `sceneItemId` n'est pas un nombre ou `sceneItemTransform` n'est pas un objet | manuel |
| AC-09 | `POST /obs/set-scene-item-enabled` `{ sceneName, sceneItemId, sceneItemEnabled }` bascule la visibilité (`SetSceneItemEnabled`), 400 si `sceneItemEnabled` n'est pas un booléen | manuel |
| AC-10 | Les 4 routes exigent le secret partagé (401 sinon) et retournent 502 si OBS refuse la requête (scène/scene item introuvable) | manuel |

> Pas de fichier de test unitaire (`relay/server.test.js`) : aucun des 3 serveurs de dev
> (`scene-data-server.js`, `placement-server.js`, `tuner-server.js`) n'a de test unitaire sur sa
> couche HTTP — convention existante du projet (effets vérifiés manuellement/visuellement, logique
> pure testée séparément, AD-1). Vérifié avec un faux serveur OBS WS v5 minimal (handshake
> HELLO/IDENTIFY + REQUEST/REQUEST_RESPONSE), étendu session 2 pour simuler
> `GetSceneItemList`/`CreateSceneItem`/`SetSceneItemTransform`/`SetSceneItemEnabled` — les 10 AC
> ci-dessus + tous les cas d'erreur (401, 400, 502) confirmés passants le 2026-07-06.

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Types JSDoc

Aucun nouveau type — ces routes ne touchent pas `types.js` (pas de `SceneConfig`/`Placement`
impliqué, juste un passthrough typé vers `sendObsRequest`, déjà non typé JSDoc dans
`relay/server.js`).

## Format de données

```js
// POST /obs/create-scene — body
{ "sceneName": "Ma Scène OBS" }

// POST /obs/set-current-scene — body
{ "sceneName": "Ma Scène OBS" }

// GET /obs/list-scenes — réponse (passthrough de GetSceneList.responseData.scenes)
{ "scenes": [{ "sceneName": "...", "sceneUuid": "...", "sceneIndex": 0 }] }

// GET /obs/list-scene-items?sceneName=X — réponse (passthrough de GetSceneItemList.responseData)
{ "sceneItems": [{ "sceneItemId": 1, "sourceName": "Webcam", "...": "..." }] }

// POST /obs/create-scene-item — body
{ "sceneName": "Just Chatting", "sourceName": "Webcam" }
// réponse
{ "sceneItemId": 1 }

// POST /obs/set-scene-item-transform — body
{
  "sceneName": "Just Chatting",
  "sceneItemId": 1,
  "sceneItemTransform": { "positionX": 40, "positionY": 40, "boundsType": "OBS_BOUNDS_NONE" }
}

// POST /obs/set-scene-item-enabled — body
{ "sceneName": "Just Chatting", "sceneItemId": 1, "sceneItemEnabled": false }
```

## Comportements

### Cas nominaux
1. `GET /obs/list-scenes` → `sendObsRequest('GetSceneList')` → renvoie `responseData` tel quel
   (contient `scenes`, `currentProgramSceneName`, etc. — pas de reformattage, le panneau consomme le
   format natif OBS pour cette première tranche).
2. `POST /obs/create-scene` `{ sceneName }` → `sendObsRequest('CreateScene', { sceneName })` → 200.
3. `POST /obs/set-current-scene` `{ sceneName }` → `sendObsRequest('SetCurrentProgramScene', { sceneName })` → 200.
4. `GET /obs/list-scene-items?sceneName=X` → `sendObsRequest('GetSceneItemList', { sceneName })` →
   renvoie `responseData` tel quel (contient `sceneItems`, chacun avec son `sceneItemId` — nécessaire
   pour cibler `set-scene-item-transform`/`set-scene-item-enabled` ensuite).
5. `POST /obs/create-scene-item` `{ sceneName, sourceName }` →
   `sendObsRequest('CreateSceneItem', { sceneName, sourceName })` → renvoie `{ sceneItemId }` (id
   attribué par OBS, à conserver côté panneau pour les actions suivantes sur ce scene item).
6. `POST /obs/set-scene-item-transform` `{ sceneName, sceneItemId, sceneItemTransform }` →
   `sendObsRequest('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform })` → 200.
7. `POST /obs/set-scene-item-enabled` `{ sceneName, sceneItemId, sceneItemEnabled }` →
   `sendObsRequest('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled })` → 200.

### Cas d'erreur
- `sceneName` manquant/vide (toutes les routes) → 400, aucune requête OBS envoyée.
- `sourceName` manquant/vide (`create-scene-item`) → 400.
- `sceneItemId` absent ou pas un nombre (`set-scene-item-transform`, `set-scene-item-enabled`) → 400.
- `sceneItemTransform` absent ou pas un objet (`set-scene-item-transform`) → 400.
- `sceneItemEnabled` absent ou pas un booléen (`set-scene-item-enabled`) → 400.
- OBS non connecté (`sendObsRequest` rejette avec `'OBS non connecté'`) → 502.
- OBS refuse la requête (nom de scène déjà pris, scène/source/scene item introuvable) → 502 avec le
  `requestStatus.comment` d'OBS tel quel (message natif, pas de traduction — cohérent avec
  `/refresh-source` existant).
- Timeout (5000ms, `OBS_REQUEST_TIMEOUT_MS` déjà en place) → 502.
- Secret absent/invalide → 401 (même contrat que `/emit`).

### Edge cases
- `sceneName`/`sourceName` avec des caractères spéciaux/unicode → transmis tel quel à OBS (OBS gère
  son propre espace de noms, pas de validation de format côté relais au-delà de "non vide").
- `sceneItemTransform` partiel (ex. seulement `positionX`/`positionY`) → transmis tel quel, OBS
  applique un merge partiel sur les champs fournis (comportement natif OBS WS v5, pas réimplémenté
  ici).

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `relay/server.js` | modifier | 3 routes scènes (`/obs/list-scenes`, `/obs/create-scene`, `/obs/set-current-scene`, AC-01 à AC-05) + 4 routes scene items (`/obs/list-scene-items`, `/obs/create-scene-item`, `/obs/set-scene-item-transform`, `/obs/set-scene-item-enabled`, AC-06 à AC-10), toutes réutilisent `sendObsRequest` |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — Session 4 (vérification end-to-end) bloquée : `OBS_WS_URL` pointe une IP LAN
      injoignable depuis cet environnement. Owner à vérifier manuellement en local, ou fournir un
      accès réseau à cette IP.
