import { describe, expect, test } from 'bun:test';
import { buttonStates, describeServers, phaseOf } from './panel-state.js';

const status = (overrides = {}) => ({ bun: '1.3.4', staticPort: 5931, statePort: 5932, staticUp: false, stateUp: false, stateAnswers: false, ...overrides });
const RUNNING = status({ staticUp: true, stateUp: true, stateAnswers: true });

describe('phaseOf', () => {
  test('arrêtés, en marche, un seul, ports étrangers', () => {
    expect(phaseOf(status())).toBe('stopped');
    expect(phaseOf(RUNNING)).toBe('running');
    expect(phaseOf(status({ staticUp: true }))).toBe('partial');
    expect(phaseOf(status({ stateUp: true, stateAnswers: true }))).toBe('partial');
    expect(phaseOf(status({ staticUp: true, stateUp: true, stateAnswers: false }))).toBe('foreign');
  });
});

describe('buttonStates : chaque bouton est actif quand son geste a un sens', () => {
  test('arrêtés : seul Démarrer est actif', () => {
    const states = buttonStates(status(), false);
    expect(states.start.disabled).toBe(false);
    expect(states.restart.disabled).toBe(true);
    expect(states.stop.disabled).toBe(true);
    expect(states.studio.disabled).toBe(true);
  });

  test('en marche : Redémarrer, Arrêter et Ouvrir le Studio sont actifs, pas Démarrer', () => {
    const states = buttonStates(RUNNING, false);
    expect(states.start.disabled).toBe(true);
    expect(states.restart.disabled).toBe(false);
    expect(states.stop.disabled).toBe(false);
    expect(states.studio.disabled).toBe(false);
  });

  test('un seul serveur : on peut redémarrer ou arrêter, pas démarrer ni ouvrir le Studio', () => {
    const states = buttonStates(status({ staticUp: true }), false);
    expect([states.start.disabled, states.restart.disabled, states.stop.disabled, states.studio.disabled]).toEqual([true, false, false, true]);
  });

  test('ports étrangers : aucun geste, le projet ne touche pas à un autre programme', () => {
    const states = buttonStates(status({ staticUp: true, stateUp: true }), false);
    expect(Object.values(states).every((state) => state.disabled)).toBe(true);
  });

  test('Bun absent : Démarrer est inactif et le dit', () => {
    const states = buttonStates(status({ bun: null }), false);
    expect(states.start.disabled).toBe(true);
    expect(states.start.reason).toContain('Bun');
  });

  test('pendant une action, tout est inactif', () => {
    const states = buttonStates(RUNNING, true);
    expect(Object.values(states).every((state) => state.disabled)).toBe(true);
    expect(states.stop.reason).toBe('Action en cours…');
  });

  test('un bouton actif n’a pas de raison à afficher', () => {
    expect(buttonStates(RUNNING, false).stop.reason).toBe('');
  });
});

describe('describeServers', () => {
  test('dit l’état, et pourquoi quand il est anormal', () => {
    expect(describeServers(RUNNING)).toMatchObject({ tone: 'ok', headline: 'Serveurs en marche' });
    expect(describeServers(status())).toMatchObject({ tone: 'off', detail: '' });
    expect(describeServers(status({ bun: null })).detail).toContain('https://bun.sh');
    expect(describeServers(status({ staticUp: true }))).toMatchObject({ tone: 'bad', headline: 'Un seul serveur répond' });
    expect(describeServers(status({ staticUp: true, stateUp: true })).detail).toContain('5931');
  });
});
