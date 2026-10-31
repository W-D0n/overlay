import { describe, expect, test } from 'bun:test';
import { backgroundSourceKind, diagnose, diagnosticReport, diagnosticSummary, outdatedServerChecks } from './diagnostics.js';

const OBS_OK = { connected: true, configured: true, reason: null, scenes: ['Jeu', 'Pause'], activeScene: 'Jeu' };
const INSPECTION = {
  obsVersion: '31.0.2',
  browserSources: [{ name: 'Fond', url: 'http://localhost:5931/background.html?preset=x' }],
  scenes: [
    { name: 'Jeu', browserSources: [{ name: 'Fond', enabled: true }] },
    { name: 'Pause', browserSources: [] },
  ],
};
const HEALTHY = { serverReachable: true, obs: OBS_OK, inspection: INSPECTION, inspectionError: null, renderPages: 1, staticPort: 5931, sceneMap: { Jeu: 'a' } };
const check = (checks, id) => checks.find((item) => item.id === id);
const tones = (input) => Object.fromEntries(diagnose(input).map(({ id, tone }) => [id, tone]));

describe('backgroundSourceKind', () => {
  test.each([
    ['http://localhost:5931/background.html', 'match'],
    ['http://127.0.0.1:5931/background.html?preset=x#y', 'match'],
    ['http://localhost:5930/background.html', 'wrong-port'],
    ['http://192.168.1.5:5931/background.html', 'wrong-port'],
    ['http://localhost:5931/dev/studio.html', 'other'],
    ['https://alerts.example/', 'other'],
    ['pas une url', 'other'],
    [null, 'other'],
  ])('%s → %s', (url, kind) => {
    expect(backgroundSourceKind(url, 5931)).toBe(kind);
  });
});

describe('diagnose', () => {
  test('chaîne saine : tout est vert', () => {
    expect(tones(HEALTHY)).toEqual({ server: 'ok', obs: 'ok', source: 'ok', scene: 'ok', render: 'ok', mapping: 'ok' });
  });

  test('serveur injoignable : seul ce constat, avec le geste de relance', () => {
    const checks = diagnose({ ...HEALTHY, serverReachable: false });
    expect(checks).toHaveLength(1);
    expect(checks[0].tone).toBe('bad');
    expect(checks[0].fix).toContain('Lance les serveurs');
  });

  test('OBS sans mot de passe : les contrôles qui en dépendent sont en attente, pas en erreur', () => {
    const result = tones({ ...HEALTHY, obs: { ...OBS_OK, connected: false, configured: false }, renderPages: 0 });
    expect(result.obs).toBe('off');
    expect(result.source).toBe('off');
    expect(result.scene).toBe('off');
  });

  test('mot de passe refusé : erreur avec la correction', () => {
    const obs = check(diagnose({ ...HEALTHY, obs: { ...OBS_OK, connected: false, reason: 'auth-rejected' } }), 'obs');
    expect(obs.tone).toBe('bad');
    expect(obs.fix).toContain('Réglages');
  });

  test('connexion en cours : avertissement sans correction à faire', () => {
    const obs = check(diagnose({ ...HEALTHY, obs: { ...OBS_OK, connected: false, reason: 'connecting' } }), 'obs');
    expect(obs.tone).toBe('warn');
    expect(obs.short).toBe('connexion en cours');
    expect(obs.fix).toBeNull();
  });

  test('OBS fermé : avertissement qui promet la reconnexion', () => {
    const obs = check(diagnose({ ...HEALTHY, obs: { ...OBS_OK, connected: false, reason: 'closed' } }), 'obs');
    expect(obs.tone).toBe('warn');
    expect(obs.fix).toContain('se rétablit seule');
  });

  test('OBS connecté mais muet : contrôles illisibles, avec la raison', () => {
    const result = diagnose({ ...HEALTHY, inspection: null, inspectionError: 'OBS n’a pas répondu à GetSceneList' });
    expect(check(result, 'source').tone).toBe('warn');
    expect(check(result, 'source').detail).toContain('GetSceneList');
  });

  test('aucune source navigateur : erreur avec l’URL à saisir', () => {
    const source = check(diagnose({ ...HEALTHY, inspection: { ...INSPECTION, browserSources: [] } }), 'source');
    expect(source.tone).toBe('bad');
    expect(source.fix).toContain('http://localhost:5931/background.html');
  });

  test('source sur un autre port : erreur qui nomme la source et l’URL attendue', () => {
    const inspection = { ...INSPECTION, browserSources: [{ name: 'Fond', url: 'http://localhost:5930/background.html' }] };
    const source = check(diagnose({ ...HEALTHY, inspection }), 'source');
    expect(source.short).toBe('mauvais port');
    expect(source.detail).toContain('« Fond »');
    expect(source.fix).toContain('5931');
  });

  test('une source ancienne sur un mauvais port est signalée même quand une autre source est bonne', () => {
    const inspection = { ...INSPECTION, browserSources: [...INSPECTION.browserSources, { name: 'Branding', url: 'http://localhost:5500/background.html' }] };
    const source = check(diagnose({ ...HEALTHY, inspection }), 'source');
    expect(source.tone).toBe('warn');
    expect(source.detail).toContain('« Branding »');
    expect(source.fix).toContain('paramètres');
  });

  test('scène active sans le fond : avertissement qui reconnaît le cas voulu', () => {
    const scene = check(diagnose({ ...HEALTHY, obs: { ...OBS_OK, activeScene: 'Pause' }, renderPages: 0 }), 'scene');
    expect(scene.tone).toBe('warn');
    expect(scene.detail).toContain('Normal si');
  });

  test('fond masqué dans la scène active : avertissement qui dit où cliquer', () => {
    const inspection = { ...INSPECTION, scenes: [{ name: 'Jeu', browserSources: [{ name: 'Fond', enabled: false }] }] };
    const result = diagnose({ ...HEALTHY, inspection, renderPages: 0 });
    expect(check(result, 'scene').short).toBe('fond masqué');
    expect(check(result, 'scene').fix).toContain('œil');
  });

  test('aucune page de rendu alors que le fond est visible : avertissement avec le geste OBS', () => {
    const render = check(diagnose({ ...HEALTHY, renderPages: 0 }), 'render');
    expect(render.tone).toBe('warn');
    expect(render.fix).toContain('Actualiser le cache');
  });

  test('aucune page de rendu alors que la scène n’affiche pas le fond : normal, sans alarme', () => {
    const render = check(diagnose({ ...HEALTHY, obs: { ...OBS_OK, activeScene: 'Pause' }, renderPages: 0 }), 'render');
    expect(render.tone).toBe('off');
  });

  test('scène associée mais renommée dans OBS : avertissement qui la nomme', () => {
    const mapping = check(diagnose({ ...HEALTHY, sceneMap: { Jeu: 'a', Ancienne: 'b' } }), 'mapping');
    expect(mapping.tone).toBe('warn');
    expect(mapping.detail).toContain('« Ancienne »');
  });

  test('aucune association : information, pas un défaut', () => {
    expect(check(diagnose({ ...HEALTHY, sceneMap: {} }), 'mapping').tone).toBe('off');
  });
});

describe('diagnosticReport', () => {
  test('liste chaque contrôle avec son geste de correction', () => {
    const report = diagnosticReport(diagnose({ ...HEALTHY, renderPages: 0 }));
    expect(report).toContain('[A VERIFIER] Page de rendu');
    expect(report).toContain('→ Dans OBS');
    expect(report).toContain('[OK] Serveurs');
  });
});

describe('diagnosticSummary', () => {
  test('compte les erreurs avant les avertissements, ignore les contrôles sans objet', () => {
    expect(diagnosticSummary(diagnose(HEALTHY))).toEqual({ tone: 'ok', text: 'Tout est en ordre' });
    expect(diagnosticSummary(diagnose({ ...HEALTHY, renderPages: 0 })).tone).toBe('warn');
    const broken = diagnose({ ...HEALTHY, inspection: { ...INSPECTION, browserSources: [] }, renderPages: 0 });
    expect(diagnosticSummary(broken)).toEqual({ tone: 'bad', text: '1 point à corriger' });
  });

  test('un serveur ancien est signalé avec sa correction', () => {
    expect(outdatedServerChecks()[0].fix).toContain('Redémarre');
  });
});

describe('images des scènes', () => {
  test('sans image utilisée, ou d’un serveur qui ne sait pas le dire, aucune ligne', () => {
    expect(check(diagnose({ ...HEALTHY }), 'images')).toBeUndefined();
    expect(check(diagnose({ ...HEALTHY, assetUse: { referenced: 0, missing: 0 } }), 'images')).toBeUndefined();
  });

  test('des images toutes présentes : ok, avec leur nombre', () => {
    const images = check(diagnose({ ...HEALTHY, assetUse: { referenced: 3, missing: 0 } }), 'images');
    expect(images).toMatchObject({ tone: 'ok', short: '3' });
  });

  test('une image manquante est une erreur, avec la marche à suivre', () => {
    const images = check(diagnose({ ...HEALTHY, assetUse: { referenced: 3, missing: 1 } }), 'images');
    expect(images.tone).toBe('bad');
    expect(images.short).toBe('1 manquante');
    expect(images.fix).toContain('Importez');
    expect(check(diagnose({ ...HEALTHY, assetUse: { referenced: 3, missing: 2 } }), 'images').short).toBe('2 manquantes');
  });
});
