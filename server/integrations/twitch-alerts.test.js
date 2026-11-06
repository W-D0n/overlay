import { describe, expect, test } from 'bun:test';
import { alertFromNotification, subscriptionsFor } from './twitch-alerts.js';

describe('alertFromNotification', () => {
  test('follow : le pseudo du nouveau follower', () => {
    expect(alertFromNotification('channel.follow', { user_name: 'Zoé', user_login: 'zoe', followed_at: 'x' })).toEqual({ type: 'follow', username: 'Zoé' });
  });

  test('nouvel abonnement : sub avec le pseudo', () => {
    expect(alertFromNotification('channel.subscribe', { user_name: 'Léa', tier: '1000', is_gift: false })).toEqual({ type: 'sub', username: 'Léa' });
  });

  test('un abonnement offert reçu ne fait pas d’alerte (le donateur en fait une, une seule)', () => {
    expect(alertFromNotification('channel.subscribe', { user_name: 'Bénéficiaire', is_gift: true })).toBeNull();
  });

  test('ré-abonnement : sub avec les mois cumulés', () => {
    expect(alertFromNotification('channel.subscription.message', { user_name: 'Nina', cumulative_months: 14, streak_months: 3 })).toEqual({ type: 'sub', username: 'Nina', amount: 14 });
  });

  test('abonnements offerts : sub du donateur, montant = nombre offert, « Anonyme » si masqué', () => {
    expect(alertFromNotification('channel.subscription.gift', { user_name: 'Gus', total: 20, is_anonymous: false })).toEqual({ type: 'sub', username: 'Gus', amount: 20 });
    expect(alertFromNotification('channel.subscription.gift', { user_name: 'Gus', total: 5, is_anonymous: true })).toEqual({ type: 'sub', username: 'Anonyme', amount: 5 });
  });

  test('bits : pseudo et montant, pas de pseudo si anonyme', () => {
    expect(alertFromNotification('channel.cheer', { user_name: 'Ana', bits: 300, is_anonymous: false })).toEqual({ type: 'bits', username: 'Ana', amount: 300 });
    expect(alertFromNotification('channel.cheer', { user_name: 'Ana', bits: 300, is_anonymous: true })).toEqual({ type: 'bits', amount: 300 });
  });

  test('raid : le streamer qui raide et ses spectateurs', () => {
    expect(alertFromNotification('channel.raid', { from_broadcaster_user_name: 'Boss', to_broadcaster_user_name: 'Moi', viewers: 120 })).toEqual({ type: 'raid', username: 'Boss', amount: 120 });
  });

  test('un type inconnu, ou un évènement qui n’est pas un objet : aucune alerte', () => {
    expect(alertFromNotification('channel.update', { title: 'x' })).toBeNull();
    expect(alertFromNotification('channel.follow', null)).toBeNull();
    expect(alertFromNotification('channel.follow', 'texte')).toBeNull();
  });

  test('un pseudo nettoyé comme toute alerte (caractères de contrôle, longueur)', () => {
    expect(alertFromNotification('channel.follow', { user_name: 'a\u0000b' })).toEqual({ type: 'follow', username: 'ab' });
    expect(alertFromNotification('channel.follow', { user_name: 'x'.repeat(200) }).username).toHaveLength(60);
  });

  test('un montant absurde est omis, l’alerte passe', () => {
    expect(alertFromNotification('channel.raid', { from_broadcaster_user_name: 'B', viewers: 'beaucoup' })).toEqual({ type: 'raid', username: 'B' });
    expect(alertFromNotification('channel.cheer', { user_name: 'A', bits: -5 })).toEqual({ type: 'bits', username: 'A' });
  });
});

describe('subscriptionsFor', () => {
  const wanted = subscriptionsFor('42');

  test('six abonnements, aux versions et conditions de la documentation Twitch', () => {
    expect(wanted.map((entry) => `${entry.type}@${entry.version}`)).toEqual([
      'channel.follow@2', 'channel.subscribe@1', 'channel.subscription.message@1', 'channel.subscription.gift@1', 'channel.cheer@1', 'channel.raid@1',
    ]);
  });

  test('le suivi exige le modérateur ; le raid vise la chaîne qui reçoit (une seule des deux clés)', () => {
    expect(wanted[0].condition).toEqual({ broadcaster_user_id: '42', moderator_user_id: '42' });
    expect(wanted[5].condition).toEqual({ to_broadcaster_user_id: '42' });
    expect(Object.keys(wanted[5].condition)).not.toContain('from_broadcaster_user_id');
  });

  test('les autres visent la chaîne', () => {
    for (const entry of wanted.slice(1, 5)) expect(entry.condition).toEqual({ broadcaster_user_id: '42' });
  });
});
