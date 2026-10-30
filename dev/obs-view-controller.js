// @ts-check
/**
 * dev/obs-view-controller.js — « Rendu OBS » : une fenêtre flottante qui montre ce que **la vraie page de rendu**
 * (`background.html`, celle que charge la Browser Source) affiche à l'antenne, en direct, à côté de l'aperçu d'édition.
 *
 * L'aperçu du Studio rend le brouillon avec le même moteur ; cette fenêtre rend l'antenne par le chemin exact d'OBS (URL,
 * transport, moteur de scène, fond transparent), ce qui attrape tout écart entre les deux. La page est annoncée au serveur
 * comme une page du Studio (`role=studio`) : elle ne se fait pas passer pour une source OBS dans le compte des sources
 * connectées, que la fenêtre affiche à part — c'est la seule façon de savoir si OBS reçoit bien l'antenne.
 *
 * La page n'est chargée que fenêtre ouverte : fermée, elle ne dessine rien et ne coûte rien.
 */
import { RENDER_REFERENCE } from '../render-reference.js';
import { buildRenderUrl } from '../render-url.js';

export const OBS_PANE_WIDTH = 360;
const OBS_PREFERENCE = 'view.obs';

/** Le texte du compte de sources OBS. @param {number | null} sources */
export function describeSources(sources) {
  if (sources === null) return 'sources OBS : état inconnu';
  if (sources === 0) return 'aucune source OBS connectée';
  return sources === 1 ? '1 source OBS connectée' : `${sources} sources OBS connectées`;
}

/**
 * @param {{
 *   elements: { button: HTMLButtonElement, pane: HTMLElement, frame: HTMLIFrameElement, status: HTMLElement, close: HTMLButtonElement },
 *   preferences: { getPreference: (key: string, fallback: boolean) => boolean, setPreference: (key: string, value: boolean) => void, subscribe: (listener: () => void) => () => void },
 *   client: { readLiveStatus(): Promise<{ renderPages: number }> },
 *   pageUrl: string,
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   intervalMs?: number,
 * }} input
 */
export function createObsViewController(input) {
  const windowRef = input.windowRef ?? window;
  const { elements, preferences } = input;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let loaded = false;
  let open = false;

  const scale = OBS_PANE_WIDTH / RENDER_REFERENCE.width;
  elements.pane.style.width = `${OBS_PANE_WIDTH}px`;
  elements.frame.style.width = `${RENDER_REFERENCE.width}px`;
  elements.frame.style.height = `${RENDER_REFERENCE.height}px`;
  elements.frame.style.transform = `scale(${scale})`;
  elements.frame.parentElement?.style.setProperty('height', `${Math.round(RENDER_REFERENCE.height * scale)}px`);

  async function refreshStatus() {
    try {
      elements.status.textContent = describeSources((await input.client.readLiveStatus()).renderPages);
    } catch {
      elements.status.textContent = describeSources(null);
    }
  }

  function apply() {
    const wanted = preferences.getPreference(OBS_PREFERENCE, false);
    elements.button.setAttribute('aria-pressed', String(wanted));
    elements.pane.hidden = !wanted;
    if (wanted === open) return;
    open = wanted;
    if (open) {
      if (!loaded) {
        elements.frame.src = buildRenderUrl({ base: input.pageUrl, role: 'studio' });
        loaded = true;
      }
      void refreshStatus();
      timer = windowRef.setInterval(() => { void refreshStatus(); }, input.intervalMs ?? 3000);
    } else {
      if (timer !== null) windowRef.clearInterval(timer);
      timer = null;
      // Fermée, la page ne dessine plus rien : on la décharge.
      elements.frame.src = 'about:blank';
      loaded = false;
    }
  }

  const toggle = () => preferences.setPreference(OBS_PREFERENCE, !preferences.getPreference(OBS_PREFERENCE, false));
  elements.button.addEventListener('click', toggle);
  elements.close.addEventListener('click', () => preferences.setPreference(OBS_PREFERENCE, false));
  const stop = preferences.subscribe(apply);
  apply();

  return {
    toggle,
    isOpen: () => open,
    destroy() {
      stop();
      if (timer !== null) windowRef.clearInterval(timer);
    },
  };
}
