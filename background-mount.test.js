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
