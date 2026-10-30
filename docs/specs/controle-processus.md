---
created: 2026-10-30
updated: 2026-10-30
---

# Spec — Démarrer, redémarrer, arrêter les serveurs depuis le produit

Statut : **D1 tranchée le 2026-10-30 : une application (coquille Tauri) qui lance et arrête les serveurs ; C1, C2, C3, C4 (kill) et C5 livrés ; coquille Tauri livrée (phase « Bun présent »), prérequis, menu Serveurs natif et diagnostic OBS livrés ; reste à éprouver par un clic la bascule « démarrer avec Windows » et le menu natif.** Besoin (owner, 2026-10-30) : les scripts lancés à la
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

### C3. Pas de confirmation (décision de l'owner, 2026-10-30)

Arrêter et redémarrer **agissent au clic**, sans confirmation : l'owner les juge inutiles. La conséquence (une source
OBS affichant le fond reste noire jusqu'au retour du serveur) est celle de l'action demandée ; la page de rendu se
reconnecte seule (`render-transport.js`). Après un redémarrage, le Studio se reconnecte seul (attente puis rechargement).
Un refus ou un silence du serveur affiche sa cause réelle (code HTTP et texte), jamais une phrase vague.

### C4. Remplacer `kill-servers.bat`

Au lancement, si un port du projet est pris par un `bun.exe` (instance précédente) : le lanceur affiche son
numéro et son heure de démarrage et **demande** « Le remplacer ? (o/N) ». `--remplacer` répond oui sans
question. Un port pris par autre chose que `bun.exe` n'est jamais touché : il est nommé. Aucun arrêt
silencieux avant un live (règle déjà posée dans `start-stream.js`). `kill-servers.*` disparaît.

### C5. Où cela apparaît dans le Studio

Dans l'en-tête, à droite du bandeau Antenne : deux boutons **Redémarrer** et **Arrêter**, autonomes (ni menu ni
confirmation, voir C3). Il n'y a pas de bouton « Démarrer » dans le Studio : sans serveur, il n'y a pas de Studio : l'état « arrêté » se constate
depuis le lanceur ou la coquille (D1).

## Ordre de livraison

1. **C1 + C2 — livré** : `dev/supervisor.js` (supervision par code de sortie) et routes `/control/restart` et
   `/control/stop`, avec tests d'intégration (arrêt à `0`, relance à `75`, 501 hors lanceur, refus sans en-tête
   et d'une autre origine) et preuve de bout en bout (les deux PID changent au redémarrage, zéro port à l'arrêt).
2. **C4 — partiellement livré** : `kill-servers` demande l'arrêt au lanceur avant de tuer (`dev/stop-servers.js`) ; l'invite « remplacer l'instance ? » au lancement de `start-stream` reste à faire.
3. **C5 + C3 — livré** : boutons Redémarrer et Arrêter du Studio, sans confirmation (2026-10-30) ; vérifié de bout en bout (les deux PID changent au redémarrage, zéro port après l'arrêt).
4. **Coquille Tauri — livrée** (`src-tauri/`) : lance `bun dev/start-stream.js` à l'ouverture, ouvre le Studio, arrête le
   lanceur et ses enfants à la fermeture, s'attache sans rien arrêter si les serveurs tournent déjà, instance unique.
   Menu Application > « Lancer au démarrage de Windows », décoché par défaut (valeur `Run` absente du registre à
   l'installation). Ports : `STATIC_PORT` / `BACKGROUND_STATE_PORT`, sinon `ports.config.js`. Redémarrer / Arrêter
   sont les deux boutons de la barre du Studio. Non éprouvé : le clic sur la case de démarrage Windows, et un exécutable
   sans Bun (phase 2 de `zero-install-local-first.md`).
5. **Application enrichie — livrée** : prérequis vérifiés au lancement (Bun absent → message avec l'adresse
   d'installation, puis sortie ; port tenu par un autre programme → message qui le dit, sans rien lancer) ; menu natif
   « Serveurs » (Démarrer, Redémarrer, Arrêter forcé) qui agit sans passer par la page, donc même quand elle ne
   répond plus, sans confirmation (2026-10-30) ; arrêt forcé = lanceur de l'application puis `kill-servers` (jamais un programme
   étranger au projet). Non éprouvé par un clic : les entrées du menu natif (les gestes sous-jacents le sont).
6. **Diagnostic — livré** : bouton « Diagnostic » du Studio ; contrôles serveurs, connexion OBS, source navigateur
   (présente, bon port), scène active (le fond y est-il visible ?), page de rendu, scènes associées (renommées ou
   supprimées dans OBS). Chaque défaut porte son geste de correction ; rapport copiable. Lecture seule d'OBS, URL
   réduites à origine + chemin (les sources tierces y portent le mot de passe WebSocket). Constat réel du 2026-10-30 :
   la source « Branding » pointait encore vers l'ancien port 5500.
7. **Garde de cycle de vie — livrée** : `dev/lifecycle.test.js` lance de vrais serveurs supervisés sur des ports d'essai et
   vérifie que `kill-servers` libère les ports même quand un serveur tué à la main a été relancé, et que `/control/*`
   change les processus puis libère les ports. Vu rouge avec l'ancien comportement (tuer les enfants seulement).

## Critères de succès (observés)

- Depuis le Studio : « Redémarrer » ramène le Studio, le serveur d'état et la page OBS (reconnectée) sans
  toucher au terminal ; « Arrêter » libère les deux ports.
- Un serveur lancé directement refuse l'arrêt (501) au lieu de mourir sans lanceur.
- Un second `start-stream` pendant qu'un premier tourne nomme l'instance en place et demande avant de la
  remplacer ; il ne touche pas un port tenu par un autre programme.

## Risques

| Risque | Parade |
|---|---|
| Un bouton qui coupe le fond en plein direct | Assumé par l'owner (pas de confirmation, C3) ; la page de rendu se reconnecte seule |
| Boucle de redémarrage | Limite de 3 relances en 60 s, puis arrêt avec message |
| Une page étrangère déclenche l'arrêt | Loopback + origine + en-tête personnalisé ; la route n'accepte que POST |
| Processus orphelin après un crash | Job Object existant ; C4 propose le remplacement au lancement suivant |

## Décisions à prendre

1. **D1 — Comment démarrer sans terminal ? Tranché (owner, 2026-10-30) : une application.** Une coquille
   Tauri (`src-tauri/`, déjà présente et non suivie) ouvre le Studio, lance les serveurs à son ouverture et les
   arrête à sa fermeture, sans terminal. Le **démarrage avec Windows est une option de l'application, désactivée
   par défaut et réversible depuis celle-ci** ; rien ne s'installe de façon cachée. Conséquences : la position
   « ne pas engager Tauri » de `zero-install-local-first.md` est levée ; Tauri est un outil de packaging (permis
   par `CLAUDE.md` §1, amendement du 2026-10-29) ; la coquille lance d'abord `bun dev/start-stream.js` (phase
   « Bun présent »), l'exécutable sans Bun (phase 2 de la spec zéro-installation) venant ensuite.
2. **D2 — Arrêt en direct** : tranché par l'owner le 2026-10-30 : aucune confirmation, aucun blocage.
