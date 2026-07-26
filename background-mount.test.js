import { describe, expect, test } from 'bun:test';
import { createBackgroundMount } from './background-mount.js';

/** Calque factice : le montage n'a pas besoin d'un vrai DOM pour être testé. */
function fakeLayer() {
  const children = [];
  return {
    style: {},
    children,
    appendChild: (child) => children.push(child),
    remove() { this.removed = true; },
    removed: false,
  };
}

/** Transition jouée à la main : frames et minuteurs déclenchés explicitement. */
function manualScheduler() {
  const frames = [];
  const timeouts = [];
  return {
    frames,
    timeouts,
    scheduleFrame: (callback) => frames.push(callback),
    scheduleTimeout: (callback, delayMs) => timeouts.push({ callback, delayMs }),
    runFrames() { const pending = frames.splice(0); for (const callback of pending) callback(); },
    runTimeouts() { const pending = timeouts.splice(0); for (const { callback } of pending) callback(); },
  };
}

function setup() {
  const events = [];
  // Le conteneur reçoit un calque, le calque reçoit l'effet : c'est cette imbrication qui permet
  // de superposer l'entrant et le sortant pendant une transition.
  const container = { appendChild: () => events.push('append:layer') };
  const trackingLayer = () => {
    const layer = fakeLayer();
    const inner = layer.appendChild;
    layer.appendChild = (child) => { events.push(`layer-append:${child.name}`); inner(child); };
    layer.remove = () => events.push('remove:layer');
    return layer;
  };
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
  return {
    events,
    mount: createBackgroundMount(/** @type {*} */ (container), {
      registry: /** @type {*} */ (registry),
      createLayer: trackingLayer,
    }),
  };
}

describe('background mount lifecycle', () => {
  test('pausing unmounts the effect and applying while paused only remembers the latest state', () => {
    const { events, mount } = setup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.setPaused(true);
    mount.apply({ component: 'RainBackground', options: { speed: 2 } });
    expect(events).toEqual([
      'create:1', 'layer-append:rain', 'append:layer', 'destroy:rain', 'remove:layer',
    ]);
  });

  test('resuming mounts the latest remembered state exactly once', () => {
    const { events, mount } = setup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.setPaused(true);
    mount.apply({ component: 'RainBackground', options: { speed: 2 } });
    mount.setPaused(false);
    expect(events.slice(-3)).toEqual(['create:2', 'layer-append:rain', 'append:layer']);
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
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ (registry), createLayer: fakeLayer });
    mount.apply({ component: 'DotGridBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(true);
    expect(calls).toEqual(['raid']);
  });

  test('react retourne false quand l’effet n’expose pas trigger', () => {
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => ({ el: { name: 'rain', remove: () => {} } }) };
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ (registry), createLayer: fakeLayer });
    mount.apply({ component: 'RainBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(false);
  });

  test('react retourne false quand rien n’est monté', () => {
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ ({}), createLayer: fakeLayer });
    expect(mount.react({ type: 'raid' })).toBe(false);
  });
});

describe('background mount audio routing', () => {
  const levels = { level: 0.5, bass: 0.4, mid: 0.3, treble: 0.2 };

  function mountWith(instance, options = { audioReactive: 'Oui' }) {
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => instance };
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ (registry), createLayer: fakeLayer });
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
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ ({}), createLayer: fakeLayer });
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
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ (registry), createLayer: fakeLayer });
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
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ (registry), onMountChange: () => { notifications += 1; }, createLayer: fakeLayer });
    mount.apply({ component: 'RainBackground', options: {} });
    mount.setPaused(true);
    mount.setPaused(false);
    mount.destroy();
    expect(notifications).toBe(4);
  });

  test('une pause identique ne notifie pas deux fois', () => {
    let notifications = 0;
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(/** @type {*} */ (container), { registry: /** @type {*} */ ({}), onMountChange: () => { notifications += 1; }, createLayer: fakeLayer });
    mount.setPaused(false);
    expect(notifications).toBe(0);
  });
});

describe('background mount transitions', () => {
  function transitionSetup() {
    const created = [];
    const container = { appendChild: () => {} };
    const registry = {
      RainBackground: (options) => {
        const instance = {
          el: { name: 'rain', remove: () => {} },
          update: () => { instance.updates += 1; },
          destroy: () => { instance.destroyed += 1; },
          updates: 0,
          destroyed: 0,
          options,
        };
        created.push(instance);
        return instance;
      },
      BubbleBackground: (options) => {
        const instance = {
          el: { name: 'bubble', remove: () => {} },
          update: () => { instance.updates += 1; },
          destroy: () => { instance.destroyed += 1; },
          updates: 0,
          destroyed: 0,
          options,
        };
        created.push(instance);
        return instance;
      },
    };
    const scheduler = manualScheduler();
    const layers = [];
    const mount = createBackgroundMount(/** @type {*} */ (container), {
      registry: /** @type {*} */ (registry),
      createLayer: () => { const layer = fakeLayer(); layers.push(layer); return layer; },
      scheduleFrame: scheduler.scheduleFrame,
      scheduleTimeout: scheduler.scheduleTimeout,
    });
    return { mount, created, layers, scheduler };
  }

  const FADE = { type: 'fade', durationMs: 600, direction: 'right' };

  test('un réglage sans transition met à jour sans créer de calque', () => {
    const { mount, created, layers } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.apply({ component: 'RainBackground', options: { speed: 2 } });

    expect(created.length).toBe(1);
    expect(created[0].updates).toBe(1);
    expect(layers.length).toBe(1);
    expect(mount.layerCount()).toBe(1);
  });

  test('une arrivée de preset superpose deux calques puis n’en laisse qu’un', () => {
    const { mount, created, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });

    expect(mount.layerCount()).toBe(2);
    expect(created[0].destroyed).toBe(0);

    scheduler.runFrames();
    scheduler.runTimeouts();
    expect(mount.layerCount()).toBe(1);
    expect(created[0].destroyed).toBe(1);
  });

  test('le calque entrant part de l’état initial puis reçoit l’état final', () => {
    const { mount, layers, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });

    const incoming = layers[1];
    expect(incoming.style.opacity).toBe('0');

    scheduler.runFrames();
    expect(incoming.style.opacity).toBe('1');
    expect(incoming.style.transition).toBe('opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)');
  });

  test('le fondu efface le calque sortant pendant que l’entrant apparaît', () => {
    const { mount, layers, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });

    const outgoingLayer = layers[0];
    expect(outgoingLayer.style.opacity).toBe('1');

    scheduler.runFrames();
    expect(outgoingLayer.style.opacity).toBe('0');
    expect(outgoingLayer.style.transition).toBe('opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)');
  });

  test('le balayage masque le sortant par dégradé, jamais par l’opacité', () => {
    const { mount, layers, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({
      component: 'BubbleBackground',
      options: {},
      transition: { type: 'wipe', durationMs: 700, direction: 'left' },
    });

    scheduler.runFrames();
    expect(layers[0].style.opacity).toBeUndefined();
    expect(layers[0].style.maskImage).toContain('transparent 0%');
    expect(layers[0].style.maskPosition).toBe(layers[1].style.maskPosition);
  });

  test('un balayage anime la position du masque et non l’opacité', () => {
    const { mount, layers, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({
      component: 'BubbleBackground',
      options: {},
      transition: { type: 'wipe', durationMs: 400, direction: 'up' },
    });

    const incoming = layers[1];
    const start = incoming.style.maskPosition;
    scheduler.runFrames();
    expect(incoming.style.maskPosition).not.toBe(start);
    expect(incoming.style.opacity).toBeUndefined();
    expect(incoming.style.transition).toBe(
      'mask-position 400ms cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-position 400ms cubic-bezier(0.4, 0, 0.2, 1)',
    );
  });

  test('une durée nulle remplace sans animation ni calque résiduel', () => {
    const { mount, created, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({
      component: 'BubbleBackground',
      options: {},
      transition: { type: 'fade', durationMs: 0, direction: 'right' },
    });

    expect(mount.layerCount()).toBe(1);
    expect(created[0].destroyed).toBe(1);
    expect(scheduler.timeouts.length).toBe(0);
  });

  test('le premier montage n’anime jamais, même avec une transition déclarée', () => {
    const { mount, layers, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {}, transition: FADE });

    expect(mount.layerCount()).toBe(1);
    expect(layers[0].style.opacity).toBeUndefined();
    expect(scheduler.timeouts.length).toBe(0);
  });

  test('une transition interrompue par une autre ne laisse qu’un calque', () => {
    const { mount, created, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });
    mount.apply({ component: 'RainBackground', options: {}, transition: FADE });

    scheduler.runFrames();
    scheduler.runTimeouts();

    expect(mount.layerCount()).toBe(1);
    expect(created[0].destroyed).toBe(1);
    expect(created[1].destroyed).toBe(1);
    expect(created[2].destroyed).toBe(0);
  });

  test('deux presets du même effet jouent quand même la transition', () => {
    const { mount, created, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: { speed: 1 } });
    mount.apply({ component: 'RainBackground', options: { speed: 4 }, transition: FADE });

    expect(created.length).toBe(2);
    expect(created[0].updates).toBe(0);
    expect(mount.layerCount()).toBe(2);

    scheduler.runFrames();
    scheduler.runTimeouts();
    expect(mount.layerCount()).toBe(1);
  });

  test('une transition dont la durée dépasse la borne est ramenée à la borne', () => {
    const { mount, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({
      component: 'BubbleBackground',
      options: {},
      transition: { type: 'fade', durationMs: 99999, direction: 'right' },
    });
    expect(scheduler.timeouts[0].delayMs).toBe(2000);
  });

  test('la reprise après pause ne rejoue pas la transition mémorisée', () => {
    const { mount, scheduler } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });
    scheduler.runFrames();
    scheduler.runTimeouts();

    mount.setPaused(true);
    mount.setPaused(false);
    expect(mount.layerCount()).toBe(1);
    expect(scheduler.timeouts.length).toBe(0);
  });

  test('destroy retire tous les calques, transition en cours comprise', () => {
    const { mount, created } = transitionSetup();
    mount.apply({ component: 'RainBackground', options: {} });
    mount.apply({ component: 'BubbleBackground', options: {}, transition: FADE });
    mount.destroy();

    expect(mount.layerCount()).toBe(0);
    expect(created[0].destroyed).toBe(1);
    expect(created[1].destroyed).toBe(1);
  });
});
