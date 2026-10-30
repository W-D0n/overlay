import { describe, expect, test } from 'bun:test';
import { createServerControlController } from './server-control-controller.js';

function button(action) {
  const listeners = [];
  return {
    disabled: false,
    getAttribute: (name) => (name === 'data-control' ? action : null),
    addEventListener: (_type, listener) => listeners.push(listener),
    click: () => listeners.forEach((listener) => listener()),
  };
}

function setup({ control = async () => {}, readObsStatus = async () => ({}) } = {}) {
  const restart = button('restart');
  const stop = button('stop');
  const status = { textContent: '', dataset: {} };
  const reloads = [];
  const calls = [];
  const windowRef = { setTimeout: (fn) => { fn(); return 0; }, location: { reload: () => reloads.push('reload') } };
  const controller = createServerControlController({
    root: { querySelectorAll: () => [restart, stop] },
    status,
    client: { control: async (action) => { calls.push(action); return control(action); }, readObsStatus },
    windowRef,
  });
  return { controller, restart, stop, status, reloads, calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('boutons Redémarrer et Arrêter', () => {
  test('un clic agit tout de suite : aucune confirmation entre le clic et la demande', async () => {
    const { restart, calls } = setup();
    restart.click();
    expect(calls).toEqual(['restart']);
    await settle();
  });

  test('redémarrer : le serveur revenu, la page se recharge', async () => {
    const { restart, reloads } = setup();
    restart.click();
    await settle();
    expect(reloads).toEqual(['reload']);
  });

  test('arrêter : la demande part, le message dit comment relancer, la page n’est pas rechargée', async () => {
    const { stop, status, reloads, calls } = setup();
    stop.click();
    await settle();
    expect(calls).toEqual(['stop']);
    expect(status.textContent).toContain('start-stream.bat');
    expect(status.dataset.tone).toBe('info');
    expect(reloads).toEqual([]);
  });

  test('les deux boutons sont inactifs pendant la demande, pour éviter un second clic', async () => {
    let release;
    const { restart, stop } = setup({ control: () => new Promise((resolve) => { release = resolve; }) });
    restart.click();
    expect(restart.disabled).toBe(true);
    expect(stop.disabled).toBe(true);
    release();
    await settle();
  });

  test('un refus affiche sa cause réelle (code et texte du serveur) et rend les boutons', async () => {
    const error = Object.assign(new Error('boum interne'), { status: 500 });
    const { restart, stop, status, reloads } = setup({ control: async () => { throw error; } });
    restart.click();
    await settle();
    expect(status.textContent).toBe('Le serveur a refusé la demande (HTTP 500) : boum interne.');
    expect(status.dataset.tone).toBe('bad');
    expect(restart.disabled).toBe(false);
    expect(stop.disabled).toBe(false);
    expect(reloads).toEqual([]);
  });

  test('un serveur injoignable le dit avec la cause de la connexion', async () => {
    const { restart, status } = setup({ control: async () => { throw new Error('Failed to fetch'); } });
    restart.click();
    await settle();
    expect(status.textContent).toBe('Le serveur n’a pas répondu : Failed to fetch.');
  });

  test('un serveur qui ne revient pas après le redémarrage est signalé, sans rechargement', async () => {
    const { restart, status, reloads } = setup({ readObsStatus: async () => { throw new Error('down'); } });
    restart.click();
    await settle();
    expect(status.textContent).toContain('pas revenu');
    expect(status.dataset.tone).toBe('bad');
    expect(reloads).toEqual([]);
  });
});
