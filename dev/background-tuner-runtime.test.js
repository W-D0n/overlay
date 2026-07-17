import { describe, expect, test } from 'bun:test';
import { BackgroundStateClientError } from './background-state-client.js';
import { stateLoadErrorMessage } from './background-tuner-runtime.js';

describe('démarrage du tuner', () => {
  test('distingue une erreur HTTP du serveur indisponible', () => {
    expect(stateLoadErrorMessage(
      new BackgroundStateClientError('state', 'état invalide', 500),
    )).toBe('GET /state : état invalide');

    expect(stateLoadErrorMessage(
      new BackgroundStateClientError('state', 'connexion refusée'),
    )).toContain("serveur d'état injoignable");
  });
});
