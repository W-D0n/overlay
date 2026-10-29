import { describe, expect, test } from 'bun:test';
import { controlFailure, controlPrompt } from './server-control.js';

describe('menu Serveurs', () => {
  test('sans source OBS connectée, le redémarrage n’avertit de rien', () => {
    expect(controlPrompt('restart', 0).warning).toBeNull();
    expect(controlPrompt('restart', null).warning).toBeNull();
  });

  test('avec une source OBS connectée, le redémarrage nomme la conséquence', () => {
    const prompt = controlPrompt('restart', 1);
    expect(prompt.warning).toContain('Une source OBS affiche le fond');
    expect(prompt.warning).toContain('se reconnectera seule');
  });

  test('l’arrêt dit toujours que le Studio ne peut pas relancer, et nomme la source OBS si elle est connectée', () => {
    expect(controlPrompt('stop', 0).warning).toContain('start-stream.bat');
    const live = controlPrompt('stop', 2).warning;
    expect(live).toContain('Une source OBS affiche le fond');
    expect(live).toContain('start-stream.bat');
  });

  test('les libellés de confirmation sont distincts', () => {
    expect(controlPrompt('restart', 0).confirmLabel).toBe('Redémarrer');
    expect(controlPrompt('stop', 0).confirmLabel).toBe('Arrêter');
  });

  test('chaque refus a son message : non supervisé, origine, ancien serveur', () => {
    expect(controlFailure(501)).toContain('start-stream');
    expect(controlFailure(403)).toContain('origine');
    expect(controlFailure(404)).toContain('antérieur');
    expect(controlFailure(null)).toContain('pas accepté');
  });
});
