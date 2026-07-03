// @ts-check
/**
 * obs-config.example.js — Gabarit de config locale du relais (S4).
 *
 * Copier ce fichier en `obs-config.local.js` (déjà dans `.gitignore` — jamais commité) et y mettre
 * le vrai secret partagé avec le relais. `store.js` importe `obs-config.local.js` en priorité et
 * retombe silencieusement sur ces valeurs par défaut (relais indisponible → mode fallback statique,
 * comportement existant, voir `docs/obs-setup.md`).
 */
export const RELAY_WS_URL = 'ws://localhost:4456/ws';
/** Doit correspondre à `OVERLAY_RELAY_SECRET` côté relais (`relay/server.js`). */
export const RELAY_TOKEN = '';
