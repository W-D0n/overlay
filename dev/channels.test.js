import { describe, expect, test } from 'bun:test';
import { CHANNEL_PATHS, channelForPath, createChannels } from './channels.js';

function socket(channel, role = 'studio') {
  const sent = [];
  return { data: { channel, role }, send: (payload) => sent.push(payload), sent };
}

describe('createChannels', () => {
  test('une diffusion ne va qu’aux abonnés du canal, en JSON', () => {
    const channels = createChannels();
    const onState = socket('state');
    const onEvent = socket('event');
    channels.add(onState);
    channels.add(onEvent);
    channels.broadcast('state', { a: 1 });
    expect(onState.sent).toEqual(['{"a":1}']);
    expect(onEvent.sent).toEqual([]);
  });

  test('un socket retiré ne reçoit plus rien', () => {
    const channels = createChannels();
    const one = socket('presets');
    channels.add(one);
    channels.remove(one);
    channels.broadcast('presets', 1);
    expect(one.sent).toEqual([]);
  });

  test('le comptage distingue les pages de rendu du Studio', () => {
    const channels = createChannels();
    channels.add(socket('state', 'render'));
    channels.add(socket('state', 'render'));
    channels.add(socket('state', 'studio'));
    expect(channels.count('state', 'render')).toBe(2);
    expect(channels.count('state')).toBe(3);
  });

  test('un canal inconnu est refusé, jamais rangé dans un autre', () => {
    const channels = createChannels();
    expect(() => channels.add(socket('inconnu'))).toThrow('canal inconnu');
    expect(() => channels.broadcast('inconnu', 1)).toThrow('canal inconnu');
    expect(channels.count('event')).toBe(0);
  });
});

describe('channelForPath', () => {
  test('chaque chemin déclaré donne son canal ; tout autre chemin donne null', () => {
    for (const [path, name] of Object.entries(CHANNEL_PATHS)) expect(channelForPath(path)).toBe(name);
    expect(channelForPath('/state')).toBeNull();
  });
});
