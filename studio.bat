@echo off
REM studio.bat — double-clic pour une session de création/réglage.
REM NE JAMAIS utiliser ce script pendant un live : il ouvre le tuner de fonds, l'éditeur de scènes
REM et la preview, avec les serveurs de persistance nécessaires. Pour streamer, utiliser
REM stream.bat.
REM
REM Un seul terminal : server/lifecycle/start-studio.js gère les serveurs comme des process enfants d'un unique
REM process Bun, tués proprement à la fermeture (Ctrl+C).

cd /d "%~dp0"

bun server\lifecycle\start-studio.js
if errorlevel 1 (
  echo.
  echo [start-studio] ERREUR : le process s'est arrete de facon inattendue ^(voir ci-dessus^).
  pause
)
