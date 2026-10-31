import { describe, expect, test } from 'bun:test';
import { describeTwitch } from './connection-view.js';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const base = { clientId: null, loggedIn: false, login: null, phase: 'logged-out', detail: null, subscriptions: 0, needsLogin: false, userCode: null, loginExpiresAt: null, lastAlertAt: null };
const view = (patch) => describeTwitch({ ...base, ...patch }, NOW);

describe('describeTwitch', () => {
  test('rien de configuré : on demande l’identifiant client, la connexion est impossible', () => {
    const result = view({});
    expect(result.text).toContain('identifiant client');
    expect(result).toMatchObject({ tone: 'attention', canLogin: false, canLogout: false, showCode: false, loginLabel: 'Connecter Twitch' });
  });

  test('identifiant saisi : prêt, on peut se connecter', () => {
    const result = view({ clientId: 'abc' });
    expect(result.text).toContain('Connecter Twitch');
    expect(result).toMatchObject({ canLogin: true, canLogout: false });
  });

  test('autorisation en attente : le code est montré, le délai restant dit, connecter désactivé', () => {
    const result = view({ clientId: 'abc', phase: 'login', userCode: 'WDJB-MJHT', loginExpiresAt: NOW + 25 * 60_000 });
    expect(result.text).toContain('25 min');
    expect(result).toMatchObject({ showCode: true, canLogin: false });
  });

  test('un délai déjà dépassé se lit 0 min, jamais négatif', () => {
    expect(view({ clientId: 'abc', phase: 'login', userCode: 'X', loginExpiresAt: NOW - 5000 }).text).toContain('0 min');
  });

  test('autorisation en attente sans code reçu : pas de panneau de code', () => {
    expect(view({ clientId: 'abc', phase: 'login', userCode: null }).showCode).toBe(false);
  });

  test('connecté : le compte, les abonnements, la dernière alerte, prêt', () => {
    const result = view({ clientId: 'abc', loggedIn: true, login: 'mozaik', phase: 'connected', subscriptions: 6, lastAlertAt: new Date(NOW - 12_000).toISOString() });
    expect(result.text).toBe('Connecté en tant que mozaik : 6 abonnements actifs. Dernière alerte il y a 12 s.');
    expect(result).toMatchObject({ tone: 'ready', canLogout: true, canLogin: true, loginLabel: 'Reconnecter Twitch' });
  });

  test('un abonnement révoqué est dit même connecté', () => {
    expect(view({ clientId: 'a', loggedIn: true, login: 'm', phase: 'connected', subscriptions: 5, detail: 'channel.cheer révoqué par Twitch (version_removed)' }).text).toContain('channel.cheer révoqué');
  });

  test('connexion en cours et reconnexion : attention, déconnexion possible', () => {
    expect(view({ clientId: 'a', loggedIn: true, phase: 'connecting' })).toMatchObject({ text: 'Connexion à Twitch en cours…', canLogout: true, tone: 'attention' });
    const lost = view({ clientId: 'a', loggedIn: true, phase: 'reconnecting', detail: 'connexion à Twitch fermée — nouvelle tentative dans 2 s' });
    expect(lost.text).toBe('Connexion à Twitch perdue : connexion à Twitch fermée — nouvelle tentative dans 2 s.');
    expect(lost.canLogout).toBe(true);
  });

  test('erreur nécessitant une reconnexion : le message est dit tel quel, le bouton devient « Reconnecter »', () => {
    const result = view({ clientId: 'a', phase: 'error', detail: 'Twitch a retiré l’autorisation : reconnectez Twitch', needsLogin: true });
    expect(result.text).toBe('Twitch a retiré l’autorisation : reconnectez Twitch.');
    expect(result).toMatchObject({ loginLabel: 'Reconnecter Twitch', canLogin: true, tone: 'attention' });
  });

  test('une erreur sans détail reste lisible', () => {
    expect(view({ clientId: 'a', phase: 'error' }).text).toBe('Erreur de connexion à Twitch.');
  });
});
