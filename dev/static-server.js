// @ts-check
/**
 * dev/static-server.js — Serveur de fichiers statiques natif Bun (remplace `bunx serve`, 2026-07-05).
 *
 * `bunx serve` relance son vrai process de travail comme petit-fils détaché du process `bunx` —
 * ce petit-fils échappe au Job Object Windows qui lie normalement un enfant `Bun.spawn` à son
 * parent, laissant un orphelin à chaque lancement de `dev/start-dev.js` (root cause identifiée
 * 2026-07-05, voir docs/inbox.md). Réécrit en `Bun.serve` natif : zéro dépendance (cohérent avec
 * CLAUDE.md — ce projet évite déjà tout `npm`/`bunx` de package tiers ailleurs), un seul process,
 * correctement lié à son parent.
 *
 * Lancement : `bun dev/static-server.js` (port 5500 par défaut, `STATIC_PORT` pour changer).
 */
const PORT = Number(process.env.STATIC_PORT ?? 5500);
const ROOT = `${import.meta.dir}/..`;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === '/' || url.pathname.endsWith('/')
      ? `${url.pathname}index.html`
      : url.pathname;

    const file = Bun.file(`${ROOT}${pathname}`);
    if (await file.exists()) return new Response(file);

    return new Response('Not Found', { status: 404 });
  },
});

console.info(`[static-server] écoute sur http://localhost:${PORT} — sert ${ROOT}`);
