// @ts-check
import { buttonStates, describeServers } from './panel-state.js';

const REFRESH_MS = 1500;
const invoke = /** @type {(command: string, args?: object) => Promise<any>} */ (window.__TAURI__.core.invoke);

const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const buttons = {
  start: /** @type {HTMLButtonElement} */ (byId('start')),
  restart: /** @type {HTMLButtonElement} */ (byId('restart')),
  stop: /** @type {HTMLButtonElement} */ (byId('stop')),
  studio: /** @type {HTMLButtonElement} */ (byId('studio')),
};
const autostart = /** @type {HTMLInputElement} */ (byId('autostart'));

let busy = false;
/** @type {import('./panel-state.js').ServersStatus | null} */
let status = null;

/** @param {string} text @param {boolean} [failed] */
function say(text, failed = false) {
  byId('message').textContent = text;
  byId('message').dataset.tone = failed ? 'bad' : 'info';
}

function paint() {
  if (status === null) return;
  const summary = describeServers(status);
  byId('status').dataset.tone = summary.tone;
  byId('headline').textContent = summary.headline;
  byId('detail').textContent = summary.detail;
  for (const [id, port, up] of /** @type {const} */ ([['port-static', status.staticPort, status.staticUp], ['port-state', status.statePort, status.stateUp]])) {
    byId(id).dataset.up = String(up);
    /** @type {HTMLElement} */ (byId(id).querySelector('b')).textContent = `${port} · ${up ? 'répond' : 'arrêté'}`;
  }
  const states = buttonStates(status, busy);
  for (const [name, button] of Object.entries(buttons)) {
    const state = states[/** @type {keyof typeof states} */ (name)];
    button.disabled = state.disabled;
    button.title = state.reason;
  }
}

async function refresh() {
  try {
    status = await invoke('servers_status');
  } catch (error) {
    say(`État illisible : ${error}`, true);
  }
  paint();
}

/**
 * @param {string} command
 * @param {string} progress
 * @param {string} done
 */
async function act(command, progress, done) {
  busy = true;
  say(progress);
  paint();
  try {
    await invoke(command);
    say(done);
  } catch (error) {
    say(String(error), true);
  }
  busy = false;
  await refresh();
}

buttons.start.onclick = () => act('servers_start', 'Démarrage…', 'Serveurs démarrés.');
buttons.restart.onclick = () => act('servers_restart', 'Redémarrage…', 'Serveurs redémarrés.');
buttons.stop.onclick = () => act('servers_stop', 'Arrêt…', 'Serveurs arrêtés.');
buttons.studio.onclick = async () => {
  try {
    await invoke('open_studio');
  } catch (error) {
    say(String(error), true);
  }
};
autostart.onchange = async () => {
  try {
    autostart.checked = await invoke('autostart_set', { enabled: autostart.checked });
  } catch (error) {
    say(`Démarrage avec Windows : ${error}`, true);
    autostart.checked = await invoke('autostart_status').catch(() => false);
  }
};

invoke('autostart_status').then((enabled) => { autostart.checked = enabled; }, () => {});
refresh();
setInterval(() => { if (!busy && !document.hidden) refresh(); }, REFRESH_MS);
