---
created: 2026-07-03
updated: 2026-10-30
---

# Configuration OBS — fond autonome

Le flux courant : une Browser Source OBS affiche `background.html`, servi par le serveur statique
local ; le Studio (tuner) écrit l'état du fond sur le serveur d'état, qui le diffuse en WebSocket.
Le moteur de scènes et son relais (port 4456) sont archivés (tag `scene-engine-v1`) : rien dans ce
document ne les concerne.

## 1. Lancer les serveurs

| Script | Usage |
|---|---|
| `start-stream.bat` | Streamer : serveur statique (`5931`) + serveur d'état du fond (`5932`). |
| `start-dev.bat` | Créer : mêmes serveurs, ouvre le Studio. **Ne pas lancer pendant un live.** |
| `kill-servers.bat` | Libérer les ports si un `bun.exe` est resté orphelin après une fermeture brutale. |

Les deux serveurs n'écoutent que sur `127.0.0.1` ; ils refusent les requêtes dont l'`Origin` ou le
`Host` n'est pas local et ne servent que les fichiers de l'overlay (pas de `.env`, `.git`, `docs/`).
Les ports se changent dans `ports.config.js` (`STATIC_PORT`, `BACKGROUND_STATE_PORT`).

## 2. Browser Source

1. **Sources → + → Navigateur**, nom libre.
2. **URL** : `http://localhost:5931/background.html` (fond courant) ou, pour un preset précis,
   l'URL copiée depuis le Studio (`?preset=<id>` ; `?scene=<id>` est accepté comme synonyme).
3. **Largeur × hauteur** : `1920 × 1080`, le canvas de référence du projet.
4. **Désactiver la source quand elle n'est pas visible** : décoché, pour que l'effet garde son état.
5. **Rafraîchir le navigateur quand la scène devient active** : voir la case 5 du QA court dans
   `docs/inbox.md` — son effet sur les transitions de preset n'est pas encore mesuré. Réglage actuel
   de l'owner : activé.
6. Micro (fonds réactifs au son) : OBS doit être lancé avec `--enable-media-stream`.

## 3. Associer une scène OBS à un preset (optionnel)

Le serveur d'état se connecte en **lecture seule** à OBS WebSocket v5 pour connaître la scène active.

1. Dans OBS : **Outils → Paramètres du serveur WebSocket**, activer le serveur et définir un mot de passe.
2. Dans le Studio, ouvrir **Réglages** et saisir le mot de passe d'OBS (la connexion se fait aussitôt, sans relancer). Alternative : copier `.env.example` en `.env` (ignoré par git) et renseigner `OBS_WS_URL` et `OBS_WS_PASSWORD` ; ce que le Studio enregistre passe devant.
   Sans mot de passe, le serveur démarre sans client OBS : le fond fonctionne, sans association de scènes.
3. Dans le Studio, onglet **Diffusion → Scènes OBS** : choisir un preset par scène. Un changement de
   scène change le fond ; une URL `?preset=` n'est jamais concernée.

Hypothèse à confirmer dans OBS (QA court, case 6) : la liste des scènes est lue une seule fois ; après avoir créé une scène, relancer le serveur
d'état (voir `docs/architecture-review.md` C6).

## 4. Vérification avant live

Le protocole de contrôle est dans `docs/inbox.md` (« QA court »). Mesures de référence : FPS et
images abandonnées d'OBS (Statistiques) avec le preset réellement utilisé.
