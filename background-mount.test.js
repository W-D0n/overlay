import { describe, expect, test } from 'bun:test';
import { createBackgroundMount } from './background-mount.js';

function setup() {
  const events = [];
  const container = { appendChild: (el) => events.push(`append:${el.name}`) };
  const registry = {
    RainBackground(options) {
      events.push(`create:${options.speed}`);
      return {
        el: { name: 'rain', remove: () => events.push('remove:rain') },
        update: (next) => events.push(`update:${next.speed}`),
        destroy: () => events.push('destroy:rain'),
      };
    },
  };
  return { events, mount: createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry)) };
}

describe('background mount lifecycle', () => {
  test('pausing unmounts the effect and applying while paused only remembers the latest state', () => {
    const { events, mount } = setup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.setPaused(true);
    mount.apply({ component: 'RainBackground', options: { speed: 2 } });
    expect(events).toEqual(['create:1', 'append:rain', 'destroy:rain', 'remove:rain']);
  });

  test('resuming mounts the latest remembered state exactly once', () => {
    const { events, mount } = setup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.setPaused(true);
    mount.apply({ component: 'RainBackground', options: { speed: 2 } });
    mount.setPaused(false);
    expect(events.slice(-2)).toEqual(['create:2', 'append:rain']);
  });
});

describe('background mount react routing', () => {
  test('react retourne true et appelle trigger quand l’effet l’expose', () => {
    const calls = [];
    const container = { appendChild: () => {} };
    const registry = {
      DotGridBackground: () => ({
        el: { name: 'dot', remove: () => {} },
        trigger: (event) => calls.push(event.type),
      }),
    };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'DotGridBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(true);
    expect(calls).toEqual(['raid']);
  });

  test('react retourne false quand l’effet n’expose pas trigger', () => {
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => ({ el: { name: 'rain', remove: () => {} } }) };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'RainBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(false);
  });

  test('react retourne false quand rien n’est monté', () => {
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ ({}));
    expect(mount.react({ type: 'raid' })).toBe(false);
  });
});

describe('background mount audio routing', () => {
  const levels = { level: 0.5, bass: 0.4, mid: 0.3, treble: 0.2 };

  function mountWith(instance, options = { audioReactive: 'Oui' }) {
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => instance };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'RainBackground', options });
    return mount;
  }

  test('applyAudio transmet les niveaux une fois quand l’effet expose setAudioLevel', () => {
    const received = [];
    const mount = mountWith({
      el: { name: 'rain', remove: () => {} },
      setAudioLevel: (value) => received.push(value),
    });
    expect(mount.isAudioReactive()).toBe(true);
    expect(mount.applyAudio(levels)).toBe(true);
    expect(received).toEqual([levels]);
  });

  test('applyAudio ne fait rien quand l’effet n’expose pas setAudioLevel', () => {
    const mount = mountWith({ el: { name: 'rain', remove: () => {} } });
    expect(mount.isAudioReactive()).toBe(false);
    expect(mount.applyAudio(levels)).toBe(false);
  });

  test('applyAudio ne fait rien quand rien n’est monté', () => {
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ ({}));
    expect(mount.isAudioReactive()).toBe(false);
    expect(mount.applyAudio(levels)).toBe(false);
  });

  test('un effet capable de réagir reste inerte tant que le preset ne l’active pas', () => {
    const received = [];
    const mount = mountWith({
      el: { name: 'rain', remove: () => {} },
      setAudioLevel: (value) => received.push(value),
    }, { audioReactive: 'Non' });
    expect(mount.isAudioReactive()).toBe(false);
    expect(mount.applyAudio(levels)).toBe(false);
    expect(received).toEqual([]);
  });

  test('activer la réactivité via update suffit, sans remonter l’effet', () => {
    const received = [];
    const instance = {
      el: { name: 'rain', remove: () => {} },
      update: () => {},
      setAudioLevel: (value) => received.push(value),
    };
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => instance };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'RainBackground', options: { audioReactive: 'Non' } });
    expect(mount.isAudioReactive()).toBe(false);
    mount.apply({ component: 'RainBackground', options: { audioReactive: 'Oui' } });
    expect(mount.isAudioReactive()).toBe(true);
    expect(mount.applyAudio(levels)).toBe(true);
    expect(received).toEqual([levels]);
  });

  test('un effet réactif démonté cesse d’être signalé comme réactif', () => {
    const mount = mountWith({
      el: { name: 'rain', remove: () => {} },
      setAudioLevel: () => {},
    });
    mount.apply({ component: null, options: {} });
    expect(mount.isAudioReactive()).toBe(false);
  });
});

describe('background mount change notification', () => {
  test('chaque changement d’effet monté notifie l’observateur', () => {
    let notifications = 0;
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => ({ el: { name: 'rain', remove: () => {} } }) };
    const mount = createBackgroundMount(
      /** @type {*} */ (container),
      /** @type {*} */ (registry),
      () => { notifications += 1; },
    );
    mount.apply({ component: 'RainBackground', options: {} });
    mount.setPaused(true);
    mount.setPaused(false);
    mount.destroy();
    expect(notifications).toBe(4);
  });

  test('une pause identique ne notifie pas deux fois', () => {
    let notifications = 0;
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(
      /** @type {*} */ (container),
      /** @type {*} */ ({}),
      () => { notifications += 1; },
    );
    mount.setPaused(false);
    expect(notifications).toBe(0);
  });
});
