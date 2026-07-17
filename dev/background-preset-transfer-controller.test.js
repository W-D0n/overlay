import { describe, expect, test } from 'bun:test';
import { createBackgroundPresetBundle } from './background-preset-library.js';
import { createBackgroundPresetTransferController } from './background-preset-transfer-controller.js';

const preset = {
  id: 'pluie-calme',
  name: 'Pluie calme',
  component: 'RainBackground',
  options: { intensity: 0.4, speed: 1, color: '#C8B97A', angle: 8 },
  tags: ['calme'],
};

function element(overrides = {}) {
  return {
    disabled: false,
    hidden: true,
    value: '',
    textContent: '',
    files: null,
    clicks: 0,
    click() { this.clicks += 1; },
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  const elements = {
    exportButton: element(),
    importTrigger: element(),
    importInput: element(),
    importReview: element(),
    importSummary: element(),
    importConfirm: element(),
    importCancel: element(),
    presetName: element(),
  };
  const reports = [];
  const links = [];
  const blobs = [];
  const revoked = [];
  const imported = [];
  const client = {
    previewPresetImport: async () => ({ revision: 'rev-1', created: 1, updated: 0, renamed: 0 }),
    importPresets: async (content, revision) => imported.push({ content, revision }),
  };
  const preview = {
    snapshot: () => ({ activePresetId: null }),
    apply() {},
    persistNow: async () => true,
  };
  const controller = createBackgroundPresetTransferController({
    elements,
    client,
    preview,
    report: {
      ok: (message) => reports.push(['ok', message]),
      error: (message) => reports.push(['error', message]),
    },
    getPresets: () => [preset],
    refreshPresets: async () => [preset],
    documentRef: {
      createElement() {
        const link = element();
        links.push(link);
        return link;
      },
    },
    windowRef: { setTimeout(callback) { callback(); return 1; } },
    urlApi: {
      createObjectURL(blob) { blobs.push(blob); return 'blob:presets'; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    ...overrides,
  });
  controller.initialize();
  return { elements, reports, links, blobs, revoked, imported };
}

describe('transfert de presets du tuner', () => {
  test('exporte la bibliothèque courante dans un fichier JSON puis libère son URL', async () => {
    const harness = createHarness();

    harness.elements.exportButton.onclick();

    expect(harness.links).toHaveLength(1);
    expect(harness.links[0]).toMatchObject({
      href: 'blob:presets',
      download: 'overlay-background-presets.json',
      clicks: 1,
    });
    expect(JSON.parse(await harness.blobs[0].text())).toEqual(createBackgroundPresetBundle([preset]));
    expect(harness.revoked).toEqual(['blob:presets']);
    expect(harness.reports.at(-1)).toEqual(['ok', '1 preset(s) exporté(s)']);
  });

  test('prévisualise un import et n’écrit qu’après confirmation', async () => {
    const harness = createHarness();
    const content = JSON.stringify(createBackgroundPresetBundle([preset]));
    harness.elements.importInput.files = [{ text: async () => content }];

    await harness.elements.importInput.onchange();

    expect(harness.imported).toEqual([]);
    expect(harness.elements.importReview.hidden).toBeFalse();
    expect(harness.elements.importSummary.textContent).toContain('1 nouveau');
    await harness.elements.importConfirm.onclick();
    expect(harness.imported).toEqual([{ content, revision: 'rev-1' }]);
    expect(harness.elements.importReview.hidden).toBeTrue();
    expect(harness.reports.at(-1)[0]).toBe('ok');
  });
});
