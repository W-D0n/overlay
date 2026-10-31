import { describe, expect, test } from 'bun:test';
import { antennaItems } from './antenna-status.js';
import { createIncidentWatcher } from './incident-watch.js';
import { createIncidentNotifier } from './incident-notifier.js';

const obsOk = { connected: true, configured: true, reason: null, activeScene: 'Jeu' };
const reading = (over = {}) => antennaItems({ serverReachable: true, obs: obsOk, renderPages: 1, audio: null, ...over });
const down = () => antennaItems({ serverReachable: false, obs: null, renderPages: null, audio: null });
const obsLost = () => reading({ obs: { connected: false, configured: true, reason: 'unreachable' } });
const noPage = () => reading({ renderPages: 0 });

/** Un observateur qui retient un changement dès le deuxième relevé identique. */
const watch = () => createIncidentWatcher({ confirmations: 2 });

describe('incident-watch', () => {
  test('le premier relevé ne dit rien, même cassé : c’est déjà dans le bandeau', () => {
    expect(watch().observe(obsLost())).toEqual([]);
  });

  test('une perte n’est annoncée qu’après deux relevés identiques de suite, puis une seule fois', () => {
    const watcher = watch();
    watcher.observe(reading());
    expect(watcher.observe(obsLost())).toEqual([]);
    const incidents = watcher.observe(obsLost());
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ id: 'obs', kind: 'lost' });
    expect(incidents[0].message).toContain('OBS n’est plus joignable');
    expect(watcher.observe(obsLost())).toEqual([]);
    expect(watcher.observe(obsLost())).toEqual([]);
  });

  test('un battement d’un seul relevé est ignoré', () => {
    const watcher = watch();
    watcher.observe(reading());
    expect(watcher.observe(noPage())).toEqual([]);
    expect(watcher.observe(reading())).toEqual([]);
    expect(watcher.observe(noPage())).toEqual([]);
    expect(watcher.observe(reading())).toEqual([]);
  });

  test('le rétablissement est annoncé après confirmation', () => {
    const watcher = watch();
    watcher.observe(reading());
    watcher.observe(noPage());
    expect(watcher.observe(noPage())[0]).toMatchObject({ id: 'render', kind: 'lost' });
    expect(watcher.observe(reading())).toEqual([]);
    const back = watcher.observe(reading());
    expect(back[0]).toMatchObject({ id: 'render', kind: 'recovered' });
    expect(back[0].message).toContain('de nouveau connectée');
  });

  test('un serveur éteint est une seule perte : OBS et la page de rendu, qui n’en sont plus lus, ne s’y ajoutent pas', () => {
    const watcher = watch();
    watcher.observe(reading());
    watcher.observe(down());
    const incidents = watcher.observe(down());
    expect(incidents.map(({ id, kind }) => `${id}:${kind}`)).toEqual(['server:lost']);
  });

  test('au retour du serveur, seul le serveur est rétabli (les points qui reviennent en même temps ne font pas de bruit)', () => {
    const watcher = watch();
    watcher.observe(reading());
    watcher.observe(down());
    watcher.observe(down());
    watcher.observe(reading());
    const incidents = watcher.observe(reading());
    expect(incidents.map(({ id, kind }) => `${id}:${kind}`)).toEqual(['server:recovered']);
  });

  test('OBS non configuré n’est jamais un incident', () => {
    const watcher = watch();
    const unconfigured = () => reading({ obs: { connected: false, configured: false, reason: null } });
    watcher.observe(unconfigured());
    expect(watcher.observe(unconfigured())).toEqual([]);
    expect(watcher.observe(unconfigured())).toEqual([]);
  });

  test('plusieurs points perdus ensemble donnent plusieurs incidents', () => {
    const watcher = watch();
    watcher.observe(reading());
    const both = () => reading({ obs: { connected: false, configured: true, reason: 'unreachable' }, renderPages: 0 });
    watcher.observe(both());
    expect(watcher.observe(both()).map(({ id }) => id)).toEqual(['obs', 'render']);
  });

  test('une seule confirmation suffit si on le demande', () => {
    const watcher = createIncidentWatcher({ confirmations: 1 });
    watcher.observe(reading());
    expect(watcher.observe(noPage())).toHaveLength(1);
  });
});

function setup({ permission = 'granted', hidden = true, enabled = true, supported = true } = {}) {
  const reports = [];
  const shown = [];
  let on = enabled;
  const documentRef = { title: 'Overlay Studio', hidden };
  class FakeNotification {
    static permission = permission;
    static async requestPermission() { FakeNotification.permission = permission === 'default' ? 'granted' : permission; return FakeNotification.permission; }
    constructor(title, options) { shown.push({ title, ...options }); }
  }
  const notifier = createIncidentNotifier({
    report: { ok: (message) => reports.push(['ok', message]), error: (message) => reports.push(['error', message]) },
    isEnabled: () => on,
    setEnabled: (value) => { on = value; },
    documentRef,
    NotificationImpl: supported ? FakeNotification : null,
  });
  return { notifier, reports, shown, documentRef, isOn: () => on, FakeNotification };
}
const lost = { id: 'obs', kind: 'lost', message: 'OBS n’est plus joignable.' };
const recovered = { id: 'obs', kind: 'recovered', message: 'OBS est de nouveau joignable.' };

describe('incident-notifier', () => {
  test('une perte passe en erreur dans la ligne d’état, un rétablissement en succès', () => {
    const { notifier, reports } = setup();
    notifier.deliver([lost]);
    notifier.deliver([recovered]);
    expect(reports).toEqual([['error', lost.message], ['ok', recovered.message]]);
  });

  test('le titre de l’onglet porte « ⚠ » tant qu’un incident dure, et le perd au rétablissement', () => {
    const { notifier, documentRef } = setup();
    notifier.deliver([lost]);
    expect(documentRef.title).toBe('⚠ Overlay Studio');
    expect(notifier.hasIncident()).toBe(true);
    notifier.deliver([{ id: 'render', kind: 'lost', message: 'x' }]);
    notifier.deliver([recovered]);
    expect(documentRef.title).toBe('⚠ Overlay Studio');
    notifier.deliver([{ id: 'render', kind: 'recovered', message: 'y' }]);
    expect(documentRef.title).toBe('Overlay Studio');
    expect(notifier.hasIncident()).toBe(false);
  });

  test('la notification du système n’est envoyée que si elle est demandée, accordée et que le Studio n’est pas visible', () => {
    const hidden = setup();
    hidden.notifier.deliver([lost]);
    expect(hidden.shown).toEqual([{ title: 'Overlay Studio — incident', body: lost.message, tag: 'overlay-obs' }]);
    expect(setup({ hidden: false }).shown).toEqual([]);
    const visible = setup({ hidden: false });
    visible.notifier.deliver([lost]);
    expect(visible.shown).toEqual([]);
    const off = setup({ enabled: false });
    off.notifier.deliver([lost]);
    expect(off.shown).toEqual([]);
    const denied = setup({ permission: 'denied' });
    denied.notifier.deliver([lost]);
    expect(denied.shown).toEqual([]);
    const unsupported = setup({ supported: false });
    expect(() => unsupported.notifier.deliver([lost])).not.toThrow();
  });

  test('un rétablissement a sa propre notification, sur le même tag (elle remplace la perte)', () => {
    const { notifier, shown } = setup();
    notifier.deliver([lost]);
    notifier.deliver([recovered]);
    expect(shown.map((entry) => entry.tag)).toEqual(['overlay-obs', 'overlay-obs']);
    expect(shown[1].title).toBe('Overlay Studio — rétabli');
  });

  test('activer demande l’autorisation ; accordée, l’option s’allume ; refusée, elle reste éteinte et le dit', async () => {
    const granted = setup({ permission: 'default', enabled: false });
    expect(await granted.notifier.toggle()).toBe(true);
    expect(granted.isOn()).toBe(true);
    const refused = setup({ permission: 'denied', enabled: false });
    expect(await refused.notifier.toggle()).toBe(false);
    expect(refused.isOn()).toBe(false);
    expect(refused.reports[0][1]).toContain('refusées');
  });

  test('désactiver ne demande rien ; un navigateur sans notifications le dit', async () => {
    const on = setup({ enabled: true });
    expect(await on.notifier.toggle()).toBe(false);
    expect(on.isOn()).toBe(false);
    const unsupported = setup({ supported: false, enabled: false });
    expect(await unsupported.notifier.toggle()).toBe(false);
    expect(unsupported.reports[0][1]).toContain('ne sait pas');
  });
});
