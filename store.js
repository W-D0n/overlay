// @ts-check
/**
 * store.js — État global du stream
 *
 * Gère deux sources de données :
 *   1. WebSocket (OBS WebSocket v5 ou MyVault) — données live
 *   2. Fallback statique — valeurs par défaut si WS indisponible
 *
 * USAGE dans une scène :
 *   <script type="module">
 *     import { store, onStateChange } from '../store.js';
 *
 *     // Lire l'état courant
 *     console.log(store.viewers);
 *
 *     // Réagir aux changements
 *     onStateChange((state) => {
 *       document.getElementById('viewers').textContent = state.viewers;
 *     });
 *   </script>
 *
 * CONFIGURATION :
 *   Modifier WS_URL pour pointer vers votre instance MyVault ou OBS WS.
 *   Modifier STATIC_FALLBACK pour les valeurs affichées hors connexion.
 */

import { reduceMessage } from './protocol.js';

/**
 * Config de connexion au relais (S4) — `obs-config.local.js` (gitignoré, secret réel) prime sur
 * `obs-config.example.js` (committé, valeurs vides). Sans relais local configuré, le token est
 * vide → le relais refuse la connexion → bascule en mode fallback statique (comportement existant).
 * @type {{ RELAY_WS_URL: string, RELAY_TOKEN: string }}
 */
const { RELAY_WS_URL, RELAY_TOKEN } = await import('./obs-config.local.js').catch(() => import('./obs-config.example.js'));

/** Délai de reconnexion initial, doublé à chaque échec (back-off exponentiel). */
const WS_RECONNECT_DELAY_MIN = 3000;

/** Plafond du back-off — au-delà, on retente toujours à ce rythme. */
const WS_RECONNECT_DELAY_MAX = 30000;

/** Délai avant de considérer le WS comme indisponible et basculer en fallback */
const WS_TIMEOUT = 2000;

// ─── Fallback statique ────────────────────────────────────────────────────────
/**
 * Valeurs affichées si WebSocket indisponible.
 * Modifier ici pour personnaliser l'affichage hors-ligne.
 * @type {import('./types.js').StreamState}
 */
const STATIC_FALLBACK = {
  streamerName:    'D0n',
  viewers:         0,
  duration:        '00:00:00',
  sessionId:       '001',
  currentActivity: 'En attente',
  currentFile:     '',
  currentBranch:   '',
  currentTool:     '',
  chatMessages:    [],
  latestAlert:     null,
  activePoll:      null,
  pomodoro: {
    secondsLeft:   1500,
    totalSeconds:  1500,
    sessionIndex:  1,
    totalSessions: 4,
    phase:         'idle',
  },
  nextStream:      '',
  nextStreamTopic: '',
  currentSong:     '',
  guest:           null,
  sessionStats: {
    maxViewers: 0,
    newFollows: 0,
    duration:   '00:00:00',
  },
  sourceTitle:    '',
  sourceAuthor:   '',
  sourcePlatform: '',
  subjectLine:    '',
  recapLines:     [],
  socialLinks:    ['twitch.tv/d0natelll0'],
  currentScene:    'brb',
  visibilityLevel: 'full',
};

// ─── État interne ─────────────────────────────────────────────────────────────

/** @type {import('./types.js').StreamState} */
export let store = { ...STATIC_FALLBACK };

/** @type {Array<(state: import('./types.js').StreamState) => void>} */
const listeners = [];

/** @type {WebSocket|null} */
let ws = null;

/** @type {boolean} */
let wsConnected = false;

/** Délai avant la prochaine tentative — croît à chaque échec, réinitialisé sur succès. */
let currentReconnectDelay = WS_RECONNECT_DELAY_MIN;

/** Évite de re-logger l'indisponibilité à chaque tentative — un seul log par passage en statique. */
let hasLoggedUnavailable = false;

// ─── Abonnements ──────────────────────────────────────────────────────────────

/**
 * S'abonner aux changements d'état.
 * Le callback est appelé immédiatement avec l'état courant,
 * puis à chaque mise à jour.
 *
 * @param {(state: import('./types.js').StreamState) => void} callback
 * @returns {() => void} Fonction de désabonnement
 */
export function onStateChange(callback) {
  listeners.push(callback);
  callback(store); // appel immédiat avec état courant

  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/**
 * Mettre à jour l'état et notifier les abonnés.
 * Fusionne partiellement (shallow merge).
 *
 * @param {Partial<import('./types.js').StreamState>} patch
 */
function setState(patch) {
  store = { ...store, ...patch };
  listeners.forEach(cb => cb(store));
}

// ─── Minuterie de durée (locale) ──────────────────────────────────────────────

let durationSeconds = 0;
let durationInterval = null;

/** Démarre le compteur de durée local (utilisé en fallback). */
function startLocalTimer() {
  if (durationInterval) return;
  durationInterval = setInterval(() => {
    durationSeconds++;
    setState({ duration: formatDuration(durationSeconds) });
  }, 1000);
}

/**
 * Formater des secondes en "HH:MM:SS".
 * @param {number} s - Secondes totales
 * @returns {string}
 */
function formatDuration(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

/**
 * Tenter de se connecter au WebSocket.
 * En cas d'échec, basculer en mode statique + minuterie locale.
 *
 * Back-off exponentiel (3s → 6s → 12s… plafonné à 30s) + logging one-shot : l'indisponibilité et
 * la fermeture ne sont loggées qu'au premier passage dans cet état, pas à chaque tentative — sinon
 * ça spamme la console tant qu'OBS/le relais est éteint (voir docs/inbox.md).
 */
function connectWebSocket() {
  // Timeout : si pas de connexion dans WS_TIMEOUT ms → fallback
  const timeout = setTimeout(() => {
    if (!wsConnected) {
      if (!hasLoggedUnavailable) {
        console.info('[overlay] WebSocket non disponible — mode statique actif');
        hasLoggedUnavailable = true;
      }
      startLocalTimer();
      // La reconnexion est planifiée par le listener 'close' (toujours déclenché après un échec
      // de connexion) — pas ici, pour éviter une double planification.
    }
  }, WS_TIMEOUT);

  const url = RELAY_TOKEN ? `${RELAY_WS_URL}?token=${encodeURIComponent(RELAY_TOKEN)}` : RELAY_WS_URL;

  try {
    ws = new WebSocket(url);
  } catch {
    clearTimeout(timeout);
    startLocalTimer();
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    clearTimeout(timeout);
    wsConnected = true;
    currentReconnectDelay = WS_RECONNECT_DELAY_MIN;
    if (hasLoggedUnavailable) {
      console.info('[overlay] WebSocket connecté');
      hasLoggedUnavailable = false;
    }
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (err) {
      console.warn('[overlay] Message WS malformé :', err);
    }
  });

  ws.addEventListener('close', () => {
    const wasConnected = wsConnected;
    wsConnected = false;
    if (wasConnected && !hasLoggedUnavailable) {
      console.info('[overlay] WebSocket fermé — reconnexion en arrière-plan');
      hasLoggedUnavailable = true;
    }
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    // L'événement 'close' suit toujours 'error' — pas besoin de gérer ici
  });
}

/** Planifier la prochaine tentative et faire croître le délai (back-off exponentiel). */
function scheduleReconnect() {
  setTimeout(connectWebSocket, currentReconnectDelay);
  currentReconnectDelay = Math.min(currentReconnectDelay * 2, WS_RECONNECT_DELAY_MAX);
}

/**
 * Effets de bord nommés que `reduceMessage` ne peut pas exécuter lui-même (pureté).
 * @type {Record<import('./types.js').EffectToken, () => void>}
 */
const EFFECT_HANDLERS = {
  'reset-duration-timer': () => { durationSeconds = 0; },
};

/**
 * Traiter un message entrant.
 *
 * `store.js` ne contient plus de logique de protocole : toute la décision est dans
 * `protocol.js` (logique pure, testée). Cette coquille injecte l'horloge, délègue à
 * `reduceMessage`, puis exécute la décision (warnings → patch → effets → events).
 *
 * @param {{ type: string, data?: unknown }} msg
 */
function handleMessage(msg) {
  const { patch, events, warnings, effects } = reduceMessage(store, msg, { now: Date.now() });

  warnings.forEach(w => console.warn(w));
  if (patch) setState(patch);                          // setState AVANT dispatch (séquencement)
  effects.forEach(token => EFFECT_HANDLERS[token]?.());
  events.forEach(e => document.dispatchEvent(new CustomEvent(e.name, { detail: e.detail })));
}

// ─── Initialisation ───────────────────────────────────────────────────────────

// Démarrer la connexion au chargement du module
connectWebSocket();
