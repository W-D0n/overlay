import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from './error-message.js';

describe('errorMessage', () => {
  test('une erreur donne son message, tout autre objet levé donne son texte, jamais « undefined »', () => {
    expect(errorMessage(new Error('panne'))).toBe('panne');
    expect(errorMessage('texte levé')).toBe('texte levé');
    expect(errorMessage({ code: 4 })).toBe('[object Object]');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

/** Les sources de l'overlay (hors essais et dépendances), pour les gardes de classe de défaut. */
function sources(dir = join(import.meta.dir, '..')) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'e2e' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(path));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') && entry.name !== 'error-message.js') found.push(path);
  }
  return found;
}

describe('garde : le texte d’une erreur attrapée passe par errorMessage', () => {
  test('aucune source ne lit `error.message` à la main ni ne recopie `instanceof Error ? … : String(…)`', () => {
    const offenders = sources().filter((path) => {
      const text = readFileSync(path, 'utf8');
      return /\berror\.message\b/.test(text) || /instanceof Error \? error\.message/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
