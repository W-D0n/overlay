# Spec — Preset automatique par scène OBS (③ de l'audit produit)

Statut : **à valider par l'owner**. Créée le 2026-07-25.

Décision owner (2026-07-25) : **on fait ③ malgré son coût**. Elle réintroduit une connexion OBS
WebSocket, retirée à l'archivage du moteur de scènes (⑦). Périmètre volontairement plus étroit que
l'ancien relais : **lire la scène active, rien d'autre**. Aucune écriture vers OBS, aucun contrôle
de scène, aucune route `/emit`.

Besoin : changer de scène dans OBS change le fond tout seul, au lieu de gérer une source Navigateur
par preset.

---

## Ce que ça remplace

Aujourd'hui : une source Navigateur par preset (`background.html?preset=<id>`), placée manuellement
dans chaque scène OBS. Ça continue de fonctionner et **reste le mode par défaut** : le mapping est
une couche en plus, désactivée tant qu'aucune association n'est enregistrée.

## Architecture

```text
OBS ──WebSocket v5──► background-state-server.js ──/state-ws──► background.html
   CurrentProgramSceneChanged      applique le preset associé
```

Le client OBS vit **dans `background-state-server.js`**, pas dans un process séparé : c'est déjà le
propriétaire de l'état et le seul serveur qui tourne pendant un live. Un second process
réintroduirait le coût qu'on vient de supprimer.

| Fichier | Rôle | Nature |
|---|---|---|
| `obs-auth.js` | Auth SHA256 OBS WS v5 | **Restauré tel quel** depuis `scene-engine-v1` (déjà testé contre `node:crypto`) |
| `obs-scene-mapping.js` | Scène active + table → preset à appliquer ; validation de la table | **Pur, testé** |
| `dev/obs-scene-client.js` | Connexion, identification, abonnement aux événements, reconnexion | Effets de bord |
| `dev/background-state-server.js` | Démarre le client si configuré, applique le preset, diffuse | Existant, étendu |
| `dev/background-state-format.js` | Champ `sceneMap` dans le fichier d'état | Existant, étendu |
| `dev/background-tuner.html` + contrôleur | Section « Scènes OBS » : associer chaque scène à un preset | Existants, étendus |

## Configuration et secret

- `OBS_WS_URL` (défaut `ws://127.0.0.1:4455`) et `OBS_WS_PASSWORD`, lus dans l'environnement.
- **Sans `OBS_WS_PASSWORD`, le client ne démarre pas** et le serveur fonctionne exactement comme
  aujourd'hui. Aucun secret dans le dépôt, aucune valeur par défaut (règle de sécurité projet).
- Un fichier `.env.example` documente les deux variables ; `.env` reste ignoré par git.

## Format du mapping

Ajout d'un champ au fichier d'état, à côté de `current` et `presets` :

```json
"sceneMap": { "Discussion": "discussion-calme", "BRB": "ambiance-nuit" }
```

- clé = **nom exact de la scène OBS**, valeur = `id` de preset ;
- une scène absente de la table = aucune action (voir ci-dessous) ;
- un `presetId` qui n'existe plus est ignoré à l'application et signalé dans le tuner, jamais
  supprimé en douce : c'est probablement un preset renommé par erreur, pas une intention.
- `sceneMap` absent d'un fichier existant vaut `{}` — les états déjà sur disque restent valides.

## Comportement

| Situation | Effet |
|---|---|
| Scène OBS activée, présente dans la table | Le preset associé devient l'état courant, diffusé à toutes les pages ouvertes |
| Scène activée, absente de la table | **Rien ne change** — le fond en cours reste, on ne noircit jamais un live sur un oubli de config |
| Preset associé supprimé entre-temps | Aucun changement, avertissement visible dans le tuner |
| OBS fermé ou injoignable | Reconnexion en boucle (2 s, 5 s, 15 s, puis 30 s), aucun effet visible à l'écran |
| Mot de passe refusé | Une seule trace serveur explicite, pas de boucle de reconnexion agressive |
| Mapping vide | Le client ne se connecte pas du tout |

Le mapping **écrase** l'état courant, y compris un réglage fait à la main dans le tuner juste avant :
c'est le sens de la fonctionnalité. Le tuner reste utilisable, mais le prochain changement de scène
OBS reprend la main. Ce point est affiché dans la section « Scènes OBS » pour éviter la surprise.

Une URL `background.html?preset=<id>` **ignore le mapping** : elle est explicitement attachée à un
preset. Seules les pages qui suivent l'état courant sont concernées.

## Logique pure (`obs-scene-mapping.js`)

- `resolveSceneMapping({ sceneName, sceneMap, presets })` → `{ preset }` ou `{ preset: null, reason }`
  avec `reason` parmi `'unmapped' | 'missing-preset'`.
- `validateSceneMap(value)` → `ValidationResult` : objet de chaînes non vides vers chaînes non
  vides, refus de tout le reste (même convention que les validateurs existants).

Aucun accès réseau, aucun état : c'est là que vivent les décisions, le client ne fait que les
appliquer.

## Interface du tuner

Nouvelle section « Scènes OBS », sous les presets :

- état de la connexion : connectée / OBS injoignable / non configurée (avec le nom des deux
  variables d'environnement dans ce dernier cas) ;
- la liste des scènes OBS réelles (requête `GetSceneList` à la connexion), chacune avec un menu
  déroulant de tes presets, plus « — aucun — » ;
- un avertissement par ligne dont le preset associé n'existe plus ;
- l'enregistrement passe par une route `POST /scene-map`, validée avant écriture, comme les presets.

Si OBS n'est pas joignable, la section affiche les associations enregistrées et reste éditable pour
celles-là, mais ne peut pas proposer de nouvelles scènes — c'est OBS qui a la liste.

## Découpage en sessions atomiques

1. **Logique et format** — `obs-scene-mapping.js`, `sceneMap` dans le format d'état, restauration de
   `obs-auth.js`. Aucun réseau, tout testé.
2. **Client OBS** — `dev/obs-scene-client.js` (connexion, identification, `GetSceneList`, événement
   `CurrentProgramSceneChanged`, reconnexion), branché dans le serveur d'état derrière la condition
   « secret présent ». Tests avec un faux serveur OBS WS local.
3. **Tuner** — section « Scènes OBS », route `POST /scene-map`, état de connexion.
4. **Vérification contre le vrai OBS** de l'owner + doc (`docs/guides/tuner-le-fond.md`, README).

## Critères d'acceptation

1. `resolveSceneMapping` : scène mappée → le preset ; scène inconnue → `'unmapped'` ; preset disparu
   → `'missing-preset'` ; table vide → `'unmapped'`.
2. `validateSceneMap` : objet valide → ok ; valeur non-chaîne, clé vide, tableau, `null` → erreurs
   listées exhaustivement.
3. Un fichier d'état sans `sceneMap` reste valide et se lit comme `{}`.
4. `POST /scene-map` invalide → 400, fichier inchangé.
5. Sans `OBS_WS_PASSWORD`, le serveur démarre sans client OBS et se comporte comme aujourd'hui
   (vérifié : aucune tentative de connexion).
6. Changement de scène simulé sur un faux serveur OBS → l'état courant devient le preset associé et
   est diffusé une seule fois sur `/state-ws`.
7. Scène non mappée → aucune diffusion, état inchangé.
8. Coupure du faux serveur OBS → reconnexion programmée, aucune exception, état inchangé.
9. `bun test` vert + vérification contre le vrai OBS (session 4, owner).

## Hors périmètre

- Écrire vers OBS (créer/activer une scène, déplacer une source) — c'était S6, resté archivé.
- Mapper autre chose qu'un preset (mode, effet direct) : le preset est déjà l'unité de réglage.
- Scène OBS renommée : l'association est perdue, à refaire dans le tuner. Suivre les renommages
  demanderait de stocker un identifiant OBS interne, complexité non justifiée aujourd'hui.

## Lacunes assumées (LAC)

- **LAC-01** — Deux instances d'OBS, ou une scène de même nom dans deux profils, ne sont pas
  distinguées : le mapping est par nom.
- **LAC-02** — Le secret vit dans l'environnement du serveur d'état. Quiconque a accès à la machine
  pendant le live a accès à OBS ; c'est le même modèle que l'ancien relais, jugé acceptable pour un
  usage local mono-poste.
