import { describe, expect, test } from 'bun:test';
import { createChannels } from './channels.js';
import { createEventIntake } from './event-intake.js';

function setup(options = {}) {
  const channels = createChannels();
  const sent = [];
  channels.add({ data: { channel: 'event', role: 'render' }, send: (payload) => sent.push(JSON.parse(payload)) });
  const other = [];
  channels.add({ data: { channel: 'state', role: 'render' }, send: (payload) => other.push(payload) });
  let time = 1_000_000;
  const intake = createEventIntake({ channels, now: () => time, ...options });
  return { intake, sent, other, advance: (ms) => { time += ms; } };
}

describe('publish', () => {
  test('diffuse l’alerte sur le canal event seulement', () => {
    const { intake, sent, other } = setup();
    expect(intake.publish({ type: 'follow', username: 'Zoé' }, 'twitchat')).toEqual({ ok: true });
    expect(sent).toEqual([{ type: 'follow', username: 'Zoé' }]);
    expect(other).toEqual([]);
  });

  test('la charge diffusée peut différer de l’entrée du journal (le bouton de test garde son corps)', () => {
    const { intake, sent } = setup();
    intake.publish({ type: 'raid' }, 'studio', { type: 'raid', custom: 'champ' });
    expect(sent).toEqual([{ type: 'raid', custom: 'champ' }]);
    expect(intake.recent()[0]).toEqual({ at: new Date(1_000_000).toISOString(), source: 'studio', type: 'raid' });
  });

  test('le journal range la plus récente d’abord, avec la source, le pseudo et le montant', () => {
    const { intake, advance } = setup();
    intake.publish({ type: 'follow', username: 'A' }, 'twitchat');
    advance(1000);
    intake.publish({ type: 'bits', username: 'B', amount: 100 }, 'twitch');
    expect(intake.recent()).toEqual([
      { at: new Date(1_001_000).toISOString(), source: 'twitch', type: 'bits', username: 'B', amount: 100 },
      { at: new Date(1_000_000).toISOString(), source: 'twitchat', type: 'follow', username: 'A' },
    ]);
  });

  test('le journal est borné à sa capacité', () => {
    const { intake } = setup({ capacity: 3, burst: 100 });
    for (let index = 0; index < 5; index += 1) intake.publish({ type: 'follow', username: `u${index}` }, 'studio');
    expect(intake.recent().map((entry) => entry.username)).toEqual(['u4', 'u3', 'u2']);
  });

  test('recent rend une copie : la modifier ne change pas le journal', () => {
    const { intake } = setup();
    intake.publish({ type: 'follow' }, 'studio');
    intake.recent().length = 0;
    expect(intake.recent()).toHaveLength(1);
  });
});

describe('limiteur', () => {
  test('au-delà de la rafale, l’alerte est refusée, comptée, et ni diffusée ni journalisée', () => {
    const { intake, sent } = setup({ burst: 3, windowMs: 5000 });
    for (let index = 0; index < 3; index += 1) expect(intake.publish({ type: 'follow' }, 'twitchat').ok).toBe(true);
    const refused = intake.publish({ type: 'follow' }, 'twitchat');
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toContain('trop d’alertes');
    expect(sent).toHaveLength(3);
    expect(intake.recent()).toHaveLength(3);
    expect(intake.refused).toBe(1);
  });

  test('la fenêtre glisse : une fois écoulée, les alertes repassent', () => {
    const { intake, advance } = setup({ burst: 2, windowMs: 5000 });
    intake.publish({ type: 'follow' }, 'studio');
    intake.publish({ type: 'follow' }, 'studio');
    expect(intake.publish({ type: 'follow' }, 'studio').ok).toBe(false);
    advance(5001);
    expect(intake.publish({ type: 'follow' }, 'studio').ok).toBe(true);
  });

  test('une alerte refusée ne prolonge pas la fenêtre', () => {
    const { intake, advance } = setup({ burst: 1, windowMs: 1000 });
    intake.publish({ type: 'follow' }, 'studio');
    advance(600);
    expect(intake.publish({ type: 'follow' }, 'studio').ok).toBe(false);
    advance(600);
    expect(intake.publish({ type: 'follow' }, 'studio').ok).toBe(true);
  });
});
