// @ts-check
import { backgroundCurrentUrl, backgroundPresetUrl } from '../background-selection.js';
import { antennaItems, antennaSummary } from './antenna-status.js';

const POLL_INTERVAL_MS = 5000;
const MARKS = { ok: '●', warn: '!', bad: '×', off: '○' };

/**
 * Bandeau « Antenne » du Studio : état permanent de la chaîne jusqu'à OBS, relu toutes les
 * 5 secondes tant que la page est visible. Les décisions d'affichage sont dans `antenna-status.js`.
 *
 * @param {{
 *   root: HTMLElement,
 *   summary: HTMLElement,
 *   items: HTMLElement,
 *   copyButton: HTMLButtonElement,
 *   client: {
 *     readObsStatus(): Promise<*>,
 *     readLiveStatus(): Promise<{ renderPages: number }>,
 *   },
 *   getActivePresetId: () => string | null,
 *   getAudio: () => { status: 'idle' | 'active' | 'unavailable', reason: string | null } | null,
 *   backgroundPageUrl: string,
 *   documentRef?: Document,
 *   navigatorRef?: Navigator,
 *   windowRef?: Window,
 *   intervalMs?: number,
 * }} input
 */
export function createAntennaController(input) {
  const documentRef = input.documentRef ?? document;
  const navigatorRef = input.navigatorRef ?? navigator;
  const windowRef = input.windowRef ?? window;


  async function refresh() {
    const obs = await input.client.readObsStatus().catch(() => null);
    const serverReachable = obs !== null;
    const renderPages = serverReachable
      ? await input.client.readLiveStatus().then(({ renderPages: count }) => count).catch(() => null)
      : null;

    const items = antennaItems({ serverReachable, obs, renderPages, audio: input.getAudio() });
    const summary = antennaSummary(items);
    input.root.dataset.tone = summary.tone;
    input.summary.textContent = summary.text;
    input.items.replaceChildren(...items.map((item) => {
      const row = documentRef.createElement('div');
      row.className = 'antenna-item';
      row.dataset.tone = item.tone;
      const mark = documentRef.createElement('span');
      mark.className = 'antenna-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = MARKS[item.tone];
      const text = documentRef.createElement('span');
      text.textContent = `${item.label} · ${item.short}`;
      row.title = `${item.label} : ${item.detail}`;
      row.append(mark, text);
      return row;
    }));
  }

  input.copyButton.onclick = async () => {
    const presetId = input.getActivePresetId();
    const url = presetId === null
      ? backgroundCurrentUrl(input.backgroundPageUrl)
      : backgroundPresetUrl(presetId, input.backgroundPageUrl);
    await navigatorRef.clipboard.writeText(url);
    input.copyButton.textContent = 'URL copiée';
    windowRef.setTimeout(() => { input.copyButton.textContent = 'Copier l’URL OBS'; }, 1200);
  };

  const timer = windowRef.setInterval(() => {
    if (!documentRef.hidden) refresh();
  }, input.intervalMs ?? POLL_INTERVAL_MS);
  refresh();

  return {
    refresh,
    destroy() {
      windowRef.clearInterval(timer);
    },
  };
}
