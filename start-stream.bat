@echo off
REM start-stream.bat — double-clic pour lancer le serveur statique + le relais OBS.
REM Ouvre 2 fenêtres (une par process) pour voir les logs de connexion en direct.
REM Nécessite un fichier .env local (copier .env.example -> .env, voir docs/obs-setup.md §4.2).

cd /d "%~dp0"

if not exist ".env" (
  echo [ERREUR] Fichier .env manquant.
  echo Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.
  echo Voir docs/obs-setup.md pour les instructions completes.
  pause
  exit /b 1
)

start "Overlay - Serveur statique (5500)" cmd /k bunx serve -l 5500 .
start "Overlay - Relais OBS" cmd /k bun relay\server.js
