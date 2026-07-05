@echo off
REM start-stream.bat — double-clic pour lancer le serveur statique + le relais OBS.
REM Ouvre 2 fenêtres (une par process) pour voir les logs de connexion en direct.
REM Nécessite un fichier .env local (copier .env.example -> .env, voir docs/obs-setup.md §4.2).
REM
REM Serveur statique natif Bun (dev/static-server.js), pas `bunx serve` — ce dernier relance son
REM vrai process de travail comme petit-fils détaché, orphelin garanti à chaque lancement
REM (root cause identifiée 2026-07-05, voir docs/inbox.md).

cd /d "%~dp0"

if not exist ".env" (
  echo [ERREUR] Fichier .env manquant.
  echo Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.
  echo Voir docs/obs-setup.md pour les instructions completes.
  pause
  exit /b 1
)

start "Overlay - Serveur statique (5500)" cmd /k bun dev\static-server.js
start "Overlay - Relais OBS" cmd /k bun relay\server.js
