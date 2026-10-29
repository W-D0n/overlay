// @ts-check
/**
 * dev/kill-servers.js — Filet de sécurité manuel : tue les serveurs de dev/live du projet restés
 * bloqués sur leur port.
 *
 * `start-dev.js` fait déjà ce nettoyage automatiquement à chaque lancement (`freeStaleBunPorts`,
 * voir `dev/port-check.js`) ; `start-stream.js` se contente de signaler le port occupé sans le
 * libérer (voulu : pas de kill silencieux juste avant/pendant un live). Ce script sert quand
 * aucun des deux lanceurs n'est en train de tourner pour faire ce nettoyage — typiquement après une
 * fermeture violente (crash, Gestionnaire des tâches, coupure) qui laisse un `bun.exe` orphelin.
 *
 * Même garde-fou que `freeStaleBunPorts` : ne touche jamais un process qui n'est pas un `bun.exe`
 * sur un des ports connus du projet — un port occupé par autre chose est signalé, pas touché.
 *
 * Lancement : `bun dev/kill-servers.js` (ou double-clic sur kill-servers.bat).
 */
import { findBusyPorts, freeStaleBunPorts } from './port-check.js';
import { STATIC_PORT, BACKGROUND_STATE_PORT } from '../ports.config.js';

/** @type {{ name: string, port: number }[]} */
const TARGETS = [
  { name: 'statique',         port: Number(process.env.STATIC_PORT ?? STATIC_PORT) },
  { name: 'background-state', port: Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT) },
];

const freed = freeStaleBunPorts(TARGETS);
for (const s of freed) {
  console.log(`[kill-servers] ${s.name} (port ${s.port}) — bun.exe orphelin tué.`);
}

const stillBusy = findBusyPorts(TARGETS);
for (const s of stillBusy) {
  console.error(
    `[kill-servers] ${s.name} (port ${s.port}) occupé par un process qui n'est PAS bun.exe — ` +
    'non touché par sécurité. Ferme-le à la main (Gestionnaire des tâches).'
  );
}

if (freed.length === 0 && stillBusy.length === 0) {
  console.log('[kill-servers] rien à faire — aucun serveur du projet trouvé sur ses ports connus.');
}
