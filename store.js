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

/** URL du WebSocket — adapter à votre setup */
const WS_URL = 'ws://localhost:4455'; // OBS WebSocket v5 par défaut

/** Intervalle de reconnexion WebSocket en ms */
const WS_RECONNECT_DELAY = 3000;

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
 */
function connectWebSocket() {
  // Timeout : si pas de connexion dans WS_TIMEOUT ms → fallback
  const timeout = setTimeout(() => {
    if (!wsConnected) {
      console.info('[overlay] WebSocket non disponible — mode statique actif');
      startLocalTimer();
    }
  }, WS_TIMEOUT);

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    clearTimeout(timeout);
    startLocalTimer();
    return;
  }

  ws.addEventListener('open', () => {
    clearTimeout(timeout);
    wsConnected = true;
    console.info('[overlay] WebSocket connecté');
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
    wsConnected = false;
    console.info(`[overlay] WebSocket fermé — reconnexion dans ${WS_RECONNECT_DELAY}ms`);
    setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
  });

  ws.addEventListener('error', () => {
    // L'événement 'close' suit toujours 'error' — pas besoin de gérer ici
  });
}

/**
 * Traiter un message WebSocket entrant.
 * Adapter selon le protocole MyVault ou OBS WebSocket v5.
 *
 * @param {{ type: string, data?: Record<string, unknown> }} msg
 */
function handleMessage(msg) {
  switch (msg.type) {

    // ── Données stream temps réel ──────────────────────────────
    case 'stream.stats':
      setState({
        viewers:  msg.data?.viewers  ?? store.viewers,
        duration: msg.data?.duration ?? store.duration,
      });
      break;

    // ── Chat ───────────────────────────────────────────────────
    case 'chat.message': {
      const newMsg = /** @type {import('./types.js').ChatMessage} */ (msg.data);
      const updated = [newMsg, ...store.chatMessages].slice(0, 20); // 20 messages max
      setState({ chatMessages: updated });
      break;
    }

    // ── Alertes ────────────────────────────────────────────────
    case 'alert.follow':
    case 'alert.sub':
    case 'alert.raid':
    case 'alert.bits':
      setState({
        latestAlert: /** @type {import('./types.js').AlertEvent} */ ({
          type:      msg.type.split('.')[1],
          username:  msg.data?.username ?? 'Anonyme',
          timestamp: Date.now(),
          amount:    msg.data?.amount,
        }),
      });
      break;

    // ── Vote ───────────────────────────────────────────────────
    case 'poll.update':
      setState({ activePoll: /** @type {import('./types.js').PollState} */ (msg.data) });
      break;

    case 'poll.end':
      setState({ activePoll: null });
      break;

    // ── Pomodoro ───────────────────────────────────────────────
    case 'pomodoro.tick':
      setState({ pomodoro: /** @type {import('./types.js').PomodoroState} */ (msg.data) });
      break;

    // ── Contexte activité ──────────────────────────────────────
    case 'context.update':
      setState({
        currentActivity: msg.data?.activity ?? store.currentActivity,
        currentFile:     msg.data?.file     ?? store.currentFile,
        currentBranch:   msg.data?.branch   ?? store.currentBranch,
        currentTool:     msg.data?.tool     ?? store.currentTool,
        subjectLine:     msg.data?.subject  ?? store.subjectLine,
        currentSong:     msg.data?.song     ?? store.currentSong,
      });
      break;

    // ── Session ────────────────────────────────────────────────
    case 'session.start':
      durationSeconds = 0;
      setState({ sessionId: msg.data?.id ?? store.sessionId });
      break;

    default:
      // Message inconnu — ignorer silencieusement
      break;
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────────

// Démarrer la connexion au chargement du module
connectWebSocket();
