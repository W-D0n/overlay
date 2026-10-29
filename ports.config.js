// @ts-check
/**
 * ports.config.js — Ports des serveurs de dev, source unique (2026-08-24).
 *
 * Avant ce fichier, les deux ports étaient recopiés en dur dans une dizaine d'endroits (serveurs
 * Bun, code navigateur, tests, config de lancement) : les changer voulait dire les traquer un par
 * un, avec le risque bien réel d'en oublier un et de laisser une partie de l'app parler à
 * l'ancien port. Toute valeur numérique doit venir d'ici, jamais d'un littéral recopié ailleurs.
 *
 * - Côté serveur (Bun), `STATIC_PORT`/`BACKGROUND_STATE_PORT` restent la façon de surcharger sans
 *   toucher au code (`dev/start-dev.js`, `dev/start-stream.js`, `dev/static-server.js`,
 *   `dev/background-state-server.js`) : `Number(process.env.STATIC_PORT ?? STATIC_PORT)`.
 * - Côté navigateur (`background.html`, `dev/background-tuner-runtime.js`), il n'y a pas de build
 *   ni de `process.env` : ce module s'importe tel quel en ESM natif, comme n'importe quel autre
 *   module partagé du projet.
 * - `.claude/launch.json` (JSON, ne peut pas importer) et les docs en prose (README, guides,
 *   specs) restent à resynchroniser à la main si ces valeurs changent — recherche "STATIC_PORT",
 *   "BACKGROUND_STATE_PORT" ou "TUNER_PORT" pour les retrouver toutes.
 */

/** Port du serveur de fichiers statiques (Studio, tuner, `background.html`). */
export const STATIC_PORT = 5931;

/** Port du serveur d'état du fond (`dev/background-state-server.js`). */
export const BACKGROUND_STATE_PORT = 5932;

/** Port du serveur d'écriture du tuner DotGrid legacy (`dev/tuner-server.js`, outil optionnel). */
export const TUNER_PORT = 4458;
