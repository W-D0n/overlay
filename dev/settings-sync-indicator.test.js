import { describe, expect, test } from 'bun:test';
import { createSettingsSyncIndicator, describeSync } from './settings-sync-indicator.js';

const source = (status, pending = false) => {
  const listeners = new Set();
  return { status: () => status, hasPending: () => pending, subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); }, set(next, p = false) { status = next; pending = p; for (const l of listeners) l(); } };
};

describe('describeSync', () => {
  test('enregistré, en cours, hors ligne', () => {
    expect(describeSync(source('synced')).state).toBe('synced');
    expect(describeSync(source('saving')).state).toBe('saving');
    expect(describeSync(source('offline')).state).toBe('offline');
  });

  test('une modification pas encore partie compte comme « en cours », jamais comme enregistrée', () => {
    expect(describeSync(source('synced', true)).state).toBe('saving');
  });

  test('hors ligne prime sur tout et le dit', () => {
    const shown = describeSync(source('offline', true));
    expect(shown.state).toBe('offline');
    expect(shown.text).toContain('non enregistrés');
  });
});

describe('createSettingsSyncIndicator', () => {
  test('suit la source et cesse de la suivre une fois détruit', () => {
    const element = { dataset: {}, textContent: '', title: '' };
    const s = source('synced');
    const indicator = createSettingsSyncIndicator({ element, source: s });
    expect(element.dataset.state).toBe('synced');
    s.set('offline');
    expect(element.dataset.state).toBe('offline');
    indicator.destroy();
    s.set('synced');
    expect(element.dataset.state).toBe('offline');
  });
});
