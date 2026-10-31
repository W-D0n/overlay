import { describe, expect, test } from 'bun:test';
import { BackgroundStateClientError } from './background-state-client.js';
import { createBackgroundPresetBundle } from './background-preset-library.js';
import { createBackgroundPresetTransferController } from './background-preset-transfer-controller.js';
import { bytesToBase64 } from './bundle-assets.js';
import { pngBytes } from './test-images.js';

const preset = {
  id: 'pluie-calme',
  name: 'Pluie calme',
  component: 'rain',
  options: { intensity: 0.4, speed: 1, color: '#C8B97A', angle: 8 },
  tags: ['calme'],
};

function element(overrides = {}) {
  return {
    disabled: false,
    hidden: true,
    value: '',
    textContent: '',
    className: '',
    children: [],
    files: null,
    clicks: 0,
    click() { this.clicks += 1; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    ...overrides,
  };
}

function visibleText(node) {
  return [node.textContent, ...node.children.map(visibleText)].filter(Boolean).join(' ');
}

function createHarness(overrides = {}) {
  const elements = {
    exportButton: element(),
    importTrigger: element(),
    importInput: element(),
    importReview: element(),
    importSummary: element(),
    importDetails: element(),
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
    previewPresetImport: async () => ({
      revision: 'rev-1',
      created: 1,
      updated: 0,
      renamed: 0,
      unchanged: 0,
      changes: [{
        id: preset.id,
        operation: 'created',
        name: preset.name,
        component: preset.component,
        requestedName: preset.name,
        renamed: false,
        conflict: null,
        differences: [
          { field: 'component', after: preset.component },
          { field: 'tags', after: preset.tags },
          { field: 'option', key: 'speed', after: 1 },
        ],
      }],
    }),
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

    await harness.elements.exportButton.onclick();

    expect(harness.links).toHaveLength(1);
    expect(harness.links[0]).toMatchObject({
      href: 'blob:presets',
      download: 'overlay-background-presets.json',
      clicks: 1,
    });
    expect(JSON.parse(await harness.blobs[0].text())).toEqual(createBackgroundPresetBundle([preset]));
    expect(harness.revoked).toEqual(['blob:presets']);
    expect(harness.reports.at(-1)).toEqual(['ok', '1 scène(s) exportée(s)']);
  });

  test('exporte aussi les scènes à plusieurs couches, en entier, et le dit', async () => {
    const multi = { version: 1, id: 'nuit', name: 'Nuit', layers: [{ id: 'rain', kind: 'rain', visible: true, opacity: 0.5, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} }] };
    const harness = createHarness({ getScenes: () => [multi] });

    await harness.elements.exportButton.onclick();

    const exported = JSON.parse(await harness.blobs[0].text());
    expect(exported.version).toBe(4);
    expect(exported.scenes).toEqual([multi]);
    expect(harness.reports.at(-1)).toEqual(['ok', '2 scène(s) exportée(s) (dont 1 à plusieurs couches)']);
  });

  test('prévisualise un import et n’écrit qu’après confirmation', async () => {
    const harness = createHarness();
    const content = JSON.stringify(createBackgroundPresetBundle([preset]));
    harness.elements.importInput.files = [{ text: async () => content }];

    await harness.elements.importInput.onchange();

    expect(harness.imported).toEqual([]);
    expect(harness.elements.importReview.hidden).toBeFalse();
    expect(harness.elements.importSummary.textContent).toContain('1 nouveau');
    expect(harness.elements.importSummary.textContent).toContain('0 ignoré');
    expect(visibleText(harness.elements.importDetails)).toContain('Création Pluie calme');
    expect(visibleText(harness.elements.importDetails)).toContain('Vitesse : 1');
    await harness.elements.importConfirm.onclick();
    expect(harness.imported).toEqual([{ content, revision: 'rev-1' }]);
    expect(harness.elements.importReview.hidden).toBeTrue();
    expect(harness.reports.at(-1)[0]).toBe('ok');
  });

  test('recalcule un aperçu obsolète et exige une nouvelle confirmation', async () => {
    const previews = [
      {
        revision: 'rev-1',
        created: 1,
        updated: 0,
        renamed: 0,
        unchanged: 0,
        changes: [{
          id: preset.id,
          operation: 'created',
          name: preset.name,
          component: preset.component,
          requestedName: preset.name,
          renamed: false,
          conflict: null,
          differences: [{ field: 'component', after: preset.component }],
        }],
      },
      {
        revision: 'rev-2',
        created: 0,
        updated: 0,
        renamed: 0,
        unchanged: 1,
        changes: [{
          id: preset.id,
          operation: 'unchanged',
          name: preset.name,
          component: preset.component,
          requestedName: preset.name,
          renamed: false,
          conflict: null,
          differences: [],
        }],
      },
    ];
    const attempts = [];
    const client = {
      previewPresetImport: async () => previews.shift(),
      importPresets: async (content, revision) => {
        attempts.push({ content, revision });
        if (attempts.length === 1) {
          throw new BackgroundStateClientError('import-presets', 'révision obsolète', 409);
        }
      },
    };
    const harness = createHarness({ client });
    const content = JSON.stringify(createBackgroundPresetBundle([preset]));
    harness.elements.importInput.files = [{ text: async () => content }];

    await harness.elements.importInput.onchange();
    await harness.elements.importConfirm.onclick();

    expect(attempts).toEqual([{ content, revision: 'rev-1' }]);
    expect(harness.elements.importReview.hidden).toBeFalse();
    expect(harness.elements.importSummary.textContent).toContain('1 ignoré');
    expect(visibleText(harness.elements.importDetails)).toContain(
      'Aucun changement : cette scène sera ignorée.',
    );
    expect(harness.reports.at(-1)).toEqual([
      'error',
      'bibliothèque modifiée — résumé actualisé, confirmer à nouveau',
    ]);

    await harness.elements.importConfirm.onclick();
    expect(attempts).toEqual([
      { content, revision: 'rev-1' },
      { content, revision: 'rev-2' },
    ]);
    expect(harness.elements.importReview.hidden).toBeTrue();
  });
});

describe('images dans les lots', () => {
  const ID = 'a'.repeat(32);
  const bytes = pngBytes(64, 36);
  const imageScene = { version: 1, id: 'affiche', name: 'Affiche', layers: [{ id: 'img', kind: 'image', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { asset: ID } }] };
  const catalog = [{ id: ID, name: 'affiche.png', type: 'png', mime: 'image/png', bytes: bytes.length, width: 64, height: 36, uses: 1, addedAt: '2026-10-31T00:00:00.000Z' }];

  test('l’export emporte les images que les scènes utilisent, en base64, et le dit', async () => {
    const harness = createHarness({ getScenes: () => [imageScene], assets: { catalog: () => catalog, download: async () => bytes, upload: async () => ({ asset: { id: ID }, created: true }) } });
    await harness.elements.exportButton.onclick();
    const exported = JSON.parse(await harness.blobs[0].text());
    expect(exported.version).toBe(4);
    expect(exported.assets).toEqual([{ id: ID, name: 'affiche.png', type: 'png', data: bytesToBase64(bytes) }]);
    expect(harness.reports.at(-1)).toEqual(['ok', '2 scène(s) exportée(s) (dont 1 à plusieurs couches) · 1 image incluse']);
  });

  test('une image que les scènes utilisent mais que la médiathèque n’a plus : l’export est fait, et signalé incomplet', async () => {
    const harness = createHarness({ getScenes: () => [imageScene], assets: { catalog: () => [], download: async () => bytes, upload: async () => ({ asset: { id: ID }, created: true }) } });
    await harness.elements.exportButton.onclick();
    expect(JSON.parse(await harness.blobs[0].text()).assets).toEqual([]);
    expect(harness.reports.at(-1)[0]).toBe('error');
    expect(harness.reports.at(-1)[1]).toContain('1 image manquante, non exportée');
  });

  test('un téléchargement qui échoue compte aussi comme image manquante', async () => {
    const harness = createHarness({ getScenes: () => [imageScene], assets: { catalog: () => catalog, download: async () => { throw new Error('HTTP 404'); }, upload: async () => ({ asset: { id: ID }, created: true }) } });
    await harness.elements.exportButton.onclick();
    expect(harness.reports.at(-1)[0]).toBe('error');
  });

  test('sans image utilisée, l’export n’en parle pas', async () => {
    const harness = createHarness({ assets: { catalog: () => catalog, download: async () => bytes, upload: async () => ({ asset: { id: ID }, created: true }) } });
    await harness.elements.exportButton.onclick();
    expect(JSON.parse(await harness.blobs[0].text()).assets).toEqual([]);
    expect(harness.reports.at(-1)).toEqual(['ok', '1 scène(s) exportée(s)']);
  });

  /** Un lot v4 tel que l'export le produit. */
  const bundleText = (assets) => JSON.stringify(createBackgroundPresetBundle([], [imageScene], assets));

  test('l’import range les images dans la médiathèque avant les scènes, et le serveur ne reçoit pas les images', async () => {
    const order = [];
    const uploaded = [];
    const client = {
      previewPresetImport: async (content) => { order.push(['preview', content]); return { revision: 'rev-1', created: 1, updated: 0, renamed: 0, unchanged: 0, changes: [] }; },
      importPresets: async (content) => { order.push(['import', content]); },
    };
    const harness = createHarness({ client, assets: { catalog: () => [], download: async () => bytes, upload: async (file) => { uploaded.push(file.name); order.push(['upload']); return { asset: { id: ID }, created: true }; } } });
    const content = bundleText([{ id: ID, name: 'affiche.png', type: 'png', data: bytesToBase64(bytes) }]);
    harness.elements.importInput.files = [{ text: async () => content }];
    await harness.elements.importInput.onchange();
    expect(harness.reports.at(-1)[1]).toContain('1 image à ajouter à la médiathèque');
    expect(order.map(([step]) => step)).toEqual(['preview']);
    expect(order[0][1]).not.toContain(bytesToBase64(bytes));
    await harness.elements.importConfirm.onclick();
    expect(order.map(([step]) => step)).toEqual(['preview', 'upload', 'import']);
    expect(uploaded).toEqual(['affiche.png']);
    expect(order[2][1]).not.toContain(bytesToBase64(bytes));
  });

  test('une image dont le contenu ne correspond pas à son identifiant fait refuser l’import : aucune scène n’est importée', async () => {
    let imports = 0;
    const client = { previewPresetImport: async () => ({ revision: 'rev-1', created: 1, updated: 0, renamed: 0, unchanged: 0, changes: [] }), importPresets: async () => { imports += 1; } };
    const harness = createHarness({ client, assets: { catalog: () => [], download: async () => bytes, upload: async () => ({ asset: { id: 'f'.repeat(32) }, created: true }) } });
    harness.elements.importInput.files = [{ text: async () => bundleText([{ id: ID, name: 'affiche.png', type: 'png', data: bytesToBase64(bytes) }]) }];
    await harness.elements.importInput.onchange();
    await harness.elements.importConfirm.onclick();
    expect(imports).toBe(0);
    expect(harness.reports.at(-1)[0]).toBe('error');
    expect(harness.reports.at(-1)[1]).toContain('lot altéré ou corrompu');
  });

  test('un lot qui porte des images sans médiathèque disponible est refusé à la confirmation', async () => {
    let imports = 0;
    const client = { previewPresetImport: async () => ({ revision: 'rev-1', created: 1, updated: 0, renamed: 0, unchanged: 0, changes: [] }), importPresets: async () => { imports += 1; } };
    const harness = createHarness({ client });
    harness.elements.importInput.files = [{ text: async () => bundleText([{ id: ID, name: 'affiche.png', type: 'png', data: bytesToBase64(bytes) }]) }];
    await harness.elements.importInput.onchange();
    await harness.elements.importConfirm.onclick();
    expect(imports).toBe(0);
    expect(harness.reports.at(-1)[1]).toContain('médiathèque est indisponible');
  });

  test('un lot dont une image est invalide est refusé dès la lecture', async () => {
    const harness = createHarness({ assets: { catalog: () => [], download: async () => bytes, upload: async () => ({ asset: { id: ID }, created: true }) } });
    harness.elements.importInput.files = [{ text: async () => bundleText([{ id: ID, name: 'x.png', type: 'png', data: '%%%' }]) }];
    await harness.elements.importInput.onchange();
    expect(harness.reports.at(-1)[0]).toBe('error');
    expect(harness.reports.at(-1)[1]).toContain('base64');
  });
});
