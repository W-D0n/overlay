@echo off
REM start-dev.bat — double-clic pour une session de création/réglage.
REM NE JAMAIS utiliser ce script pendant un live : il ouvre le tuner de fonds, l'éditeur de scènes
REM et la preview, avec les serveurs de persistance nécessaires. Pour streamer, utiliser
REM start-stream.bat.
REM
REM Un seul terminal : dev/start-dev.js gère les serveurs comme des process enfants d'un unique
REM process Bun, tués proprement à la fermeture (Ctrl+C).

cd /d "%~dp0"

bun dev\start-dev.js
if errorlevel 1 (
  echo.
  echo [start-dev] ERREUR : le process s'est arrete de facon inattendue ^(voir ci-dessus^).
  pause
)
