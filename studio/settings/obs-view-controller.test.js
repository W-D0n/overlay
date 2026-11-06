import { describe, expect, test } from 'bun:test';
import { OBS_PANE_WIDTH, createObsViewController, describeSources } from './obs-view-controller.js';

function setup({ initial = false, sources = 2 } = {}) {
  const prefs = new Map(initial ? [['view.obs', true]] : []);
  const listeners = new Set();
  const preferences = {
    getPreference: (key, fallback) => (prefs.has(key) ? prefs.get(key) : fallback),
    setPreference: (key, value) => { prefs.set(key, value); for (const l of listeners) l(); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
  const listenersByEvent = {};
  const element = (extra = {}) => ({ style: { setProperty() {} }, hidden: false, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(e, fn) { listenersByEvent[`${this.name}:${e}`] = fn; }, ...extra });
  const elements = {
    button: element({ name: 'button' }), pane: element({ name: 'pane' }), status: element(), close: element({ name: 'close' }),
    frame: element({ src: '', parentElement: { style: { setProperty() {} } } }),
  };
  const intervals = [];
  const windowRef = { setInterval: (fn, ms) => { intervals.push({ fn, ms, cleared: false }); return intervals.length - 1; }, clearInterval: (id) => { intervals[id].cleared = true; } };
  let live = sources;
  const client = { readLiveStatus: async () => { if (live === 'down') throw new Error('x'); return { renderPages: live }; } };
  const controller = createObsViewController({ elements, preferences, client, pageUrl: 'http://localhost:5500/background.html', windowRef });
  return { controller, elements, prefs, intervals, click: (name) => listenersByEvent[name](), setLive: (v) => { live = v; } };
}

describe('describeSources', () => {
  test('aucune, une, plusieurs, inconnue', () => {
    expect(describeSources(0)).toBe('aucune source OBS connectée');
    expect(describeSources(1)).toBe('1 source OBS connectée');
    expect(describeSources(3)).toBe('3 sources OBS connectées');
    expect(describeSources(null)).toContain('inconnu');
  });
});

describe('fenêtre « Rendu OBS »', () => {
  test('fermée au départ : rien n’est chargé, aucun minuteur', () => {
    const { elements, intervals } = setup();
    expect(elements.pane.hidden).toBe(true);
    expect(elements.frame.src).toBe('');
    expect(intervals).toHaveLength(0);
    expect(elements.button.attrs['aria-pressed']).toBe('false');
  });

  test('ouvrir charge la vraie page de rendu comme page du Studio, à l’échelle de la fenêtre', async () => {
    const { elements, click, intervals } = setup();
    click('button:click');
    expect(elements.pane.hidden).toBe(false);
    const url = new URL(elements.frame.src);
    expect(url.pathname).toBe('/background.html');
    expect(url.searchParams.get('role')).toBe('studio');
    expect(url.searchParams.get('transparent')).toBe('1');
    expect(elements.frame.style.transform).toBe(`scale(${OBS_PANE_WIDTH / 1920})`);
    expect(intervals).toHaveLength(1);
    expect(elements.button.attrs['aria-pressed']).toBe('true');
    await Promise.resolve();
    await Promise.resolve();
    expect(elements.status.textContent).toBe('2 sources OBS connectées');
  });

  test('fermer décharge la page et arrête le minuteur ; rouvrir recharge', () => {
    const { elements, click, intervals } = setup();
    click('button:click');
    click('close:click');
    expect(elements.pane.hidden).toBe(true);
    expect(elements.frame.src).toBe('about:blank');
    expect(intervals[0].cleared).toBe(true);
    click('button:click');
    expect(elements.frame.src).toContain('background.html');
    expect(intervals).toHaveLength(2);
  });

  test('ouverte au départ par la préférence (mémorisée sur le serveur) : elle s’ouvre aussitôt', () => {
    const { elements, intervals } = setup({ initial: true });
    expect(elements.pane.hidden).toBe(false);
    expect(elements.frame.src).toContain('background.html');
    expect(intervals).toHaveLength(1);
  });

  test('un serveur qui ne répond pas laisse un état « inconnu », sans casser la fenêtre', async () => {
    const { elements, click, setLive } = setup({ sources: 'down' });
    click('button:click');
    await Promise.resolve();
    await Promise.resolve();
    expect(elements.status.textContent).toContain('inconnu');
    setLive(0);
  });
});
