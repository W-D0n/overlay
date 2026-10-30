import { describe, expect, test } from 'bun:test';
import { controlFailure } from './server-control.js';

describe('boutons Serveurs', () => {
  test('chaque refus connu a son message : non supervisé, origine, ancien serveur', () => {
    expect(controlFailure(501)).toContain('start-stream');
    expect(controlFailure(403)).toContain('origine');
    expect(controlFailure(404)).toContain('antérieur');
  });

  test('un silence du serveur dit que rien n’a répondu, avec la cause de la connexion', () => {
    expect(controlFailure(null, 'Failed to fetch')).toBe('Le serveur n’a pas répondu : Failed to fetch.');
    expect(controlFailure(null)).toBe('Le serveur n’a pas répondu.');
  });

  test('tout autre code est nommé avec le texte du serveur, jamais réduit à une phrase vague', () => {
    expect(controlFailure(500, 'boum')).toBe('Le serveur a refusé la demande (HTTP 500) : boum.');
    expect(controlFailure(400, 'en-tête X-Overlay-Control requis')).toContain('HTTP 400');
    expect(controlFailure(429)).toBe('Le serveur a refusé la demande (HTTP 429).');
  });
});
