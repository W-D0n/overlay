---
created: 2026-10-30
updated: 2026-10-30
---

# Spec — Démarrer, redémarrer, arrêter les serveurs depuis le produit

Statut : **Draft, à valider par l'owner avant code.** Besoin (owner, 2026-10-30) : les scripts lancés à la
main (`start-stream.bat`, `kill-servers.bat`) doivent devenir des fonctions du produit.

## Ce qui est possible, et la limite

Le Studio est **servi par** les serveurs qu'il voudrait piloter. Une page web ne peut donc pas *démarrer* un
serveur qui n'existe pas encore : il faut un processus qui tourne déjà. La spec distingue trois fonctions
et dit pour chacune ce qui la porte.

| Fonction | Où elle peut vivre | Dépend de |
|---|---|---|
| **Arrêter** | Bouton du Studio → le serveur d'état demande l'arrêt au lanceur | Un lanceur qui supervise (existe : `dev/start-stream.js`) |
| **Redémarrer** (recharger le code, ou après un blocage) | Bouton du Studio → le lanceur relance les enfants | Idem |
| **Démarrer** | Hors de la page : un coquille locale (Tauri, `src-tauri/` existe, décision en attente) **ou** un démarrage automatique de Windows | Décision D1 |
| **Libérer un port bloqué par un ancien serveur** | Le lanceur, au démarrage (remplace `kill-servers.bat`) | Garde-fou existant : jamais autre chose qu'un `bun.exe` du projet |

## Conception

### C1. Le lanceur supervise ses enfants

`dev/start-stream.js` lance déjà le serveur statique et le serveur d'état dans un seul processus (Job Object
Windows : fermer la fenêtre tue les enfants). Il gagne une règle de supervision, par **code de sortie** d'un
enfant : `0` = arrêt demandé (tout s'arrête, le lanceur sort) ; `75` = redémarrage demandé (les deux enfants
sont relancés, le code rechargé) ; autre = incident (journalisé, relance limitée à 3 essais en 60 s pour ne
pas boucler pendant un live).

### C2. Un point de contrôle, local et explicite

`POST /control/restart` et `POST /control/stop` sur le serveur d'état. Il transmet la demande au lanceur
(canal IPC de `Bun.spawn`) ; lancé **sans** lanceur (un serveur lancé directement, les tests), il répond 501
« non supervisé » et ne s'arrête pas. Accès : mêmes contrôles de loopback et d'origine que le reste
(`dev/local-access-policy.js`), plus un en-tête personnalisé exigé, ce qui force une requête préalable CORS
qu'une page étrangère ne passe pas. **Aucune route ne tue un processus par son numéro** : le serveur ne
demande que sa propre sortie.

### C3. Garde-fou pour le direct

Si `GET /live-status` indique des pages de rendu connectées (une source OBS affiche le fond), arrêter ou
redémarrer **demande confirmation** et nomme la conséquence : « Une source OBS affiche le fond : elle restera
noire jusqu'au retour du serveur » (la page de rendu se reconnecte seule, `render-transport.js`). Après un
redémarrage, le Studio se reconnecte seul (attente + bandeau Antenne).

### C4. Remplacer `kill-servers.bat`

Au lancement, si un port du projet est pris par un `bun.exe` (instance précédente) : le lanceur affiche son
numéro et son heure de démarrage et **demande** « Le remplacer ? (o/N) ». `--remplacer` répond oui sans
question. Un port pris par autre chose que `bun.exe` n'est jamais touché : il est nommé. Aucun arrêt
silencieux avant un live (règle déjà posée dans `start-stream.js`). `kill-servers.*` disparaît.

### C5. Où cela apparaît dans le Studio

Dans l'en-tête, à droite du bandeau Antenne : un bouton « Serveurs » ouvrant un menu **Redémarrer** /
**Arrêter**, avec la confirmation de C3. Sans serveur, il n'y a pas de Studio : l'état « arrêté » se constate
depuis le lanceur ou la coquille (D1).

## Ordre de livraison

1. **C1 + C2** : supervision par code de sortie et routes de contrôle, avec tests d'intégration (un serveur
   supervisé qui s'arrête à `0`, qui est relancé à `75`, qui répond 501 hors lanceur).
2. **C4** : remplacement guidé de l'instance précédente.
3. **C5 + C3** : menu du Studio et confirmation en direct.
4. **D1** (démarrer) : selon la décision.

## Critères de succès (observés)

- Depuis le Studio : « Redémarrer » ramène le Studio, le serveur d'état et la page OBS (reconnectée) sans
  toucher au terminal ; « Arrêter » libère les deux ports.
- Un serveur lancé directement refuse l'arrêt (501) au lieu de mourir sans lanceur.
- Un second `start-stream` pendant qu'un premier tourne nomme l'instance en place et demande avant de la
  remplacer ; il ne touche pas un port tenu par un autre programme.
- Pendant qu'une source OBS est connectée, l'arrêt demande confirmation.

## Risques

| Risque | Parade |
|---|---|
| Un bouton qui coupe le fond en plein direct | Confirmation C3 nommant la conséquence ; la page de rendu se reconnecte seule |
| Boucle de redémarrage | Limite de 3 relances en 60 s, puis arrêt avec message |
| Une page étrangère déclenche l'arrêt | Loopback + origine + en-tête personnalisé ; la route n'accepte que POST |
| Processus orphelin après un crash | Job Object existant ; C4 propose le remplacement au lancement suivant |

## Décisions à prendre

1. **D1 — Comment démarrer sans terminal ?** (a) **Coquille Tauri** : une application qui ouvre le Studio et
   lance et arrête les serveurs avec elle (la fenêtre fermée, tout s'arrête). C'est la solution complète
   et elle règle aussi « libérer un port » ; elle introduit un outil de build (décision Tauri en attente).
   (b) **Démarrage automatique de Windows** : un raccourci dans le dossier Démarrage lance `start-stream`
   à l'ouverture de session ; le Studio est alors toujours disponible, sans nouvel outil. *Recommandation :
   (b) tout de suite, (a) si vous décidez Tauri.*
2. **D2 — Arrêt en direct** : confirmation (proposé) ou blocage tant qu'une source est connectée ?
   *Recommandation : confirmation.*
