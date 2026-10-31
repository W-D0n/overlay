import { describe, expect, test } from 'bun:test';
import { createAssetClient } from './asset-client.js';
import { ACCEPTED_IMAGE_TYPES, describeAsset, formatBytes, pickImageFiles, summarizeImport } from './asset-library-view.js';

/** Un `fetch` qui note ce qu'on lui demande et répond ce qu'on lui a préparé. */
function fakeFetch(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createAssetClient', () => {
  test('liste les assets', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ assets: [{ id: 'a', name: 'x.png', uses: 1 }] }));
    const client = createAssetClient({ baseUrl: 'http://localhost:5932/', fetchImpl });
    expect(await client.list()).toEqual([{ id: 'a', name: 'x.png', uses: 1 }]);
    expect(calls[0].url).toBe('http://localhost:5932/assets');
  });

  test('envoie un fichier avec son nom encodé, en octets bruts', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ asset: { id: 'a' }, created: true }, 201));
    const client = createAssetClient({ baseUrl: 'http://x', fetchImpl });
    const file = new File(['abc'], 'ma photo & moi.png', { type: 'image/png' });
    expect(await client.upload(file)).toEqual({ asset: { id: 'a' }, created: true });
    expect(calls[0].url).toBe('http://x/assets?name=ma%20photo%20%26%20moi.png');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/octet-stream');
    expect(calls[0].init.body).toBe(file);
  });

  test('supprime par identifiant', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ ok: true }));
    await createAssetClient({ baseUrl: 'http://x', fetchImpl }).remove('a'.repeat(32));
    expect(calls[0]).toMatchObject({ url: `http://x/assets/${'a'.repeat(32)}`, init: { method: 'DELETE' } });
  });

  test('une erreur du serveur sort avec son message, son statut et ses usages', async () => {
    const { fetchImpl } = fakeFetch(json({ error: 'cette image est utilisée 2 fois', uses: 2 }, 409));
    const failure = await createAssetClient({ baseUrl: 'http://x', fetchImpl }).remove('a'.repeat(32)).catch((error) => error);
    expect(failure.message).toBe('cette image est utilisée 2 fois');
    expect(failure.status).toBe(409);
    expect(failure.uses).toBe(2);
  });

  test('une réponse sans corps lisible donne le statut ; un serveur éteint donne un message clair', async () => {
    const { fetchImpl } = fakeFetch(new Response('boum', { status: 500 }), new TypeError('Failed to fetch'));
    const client = createAssetClient({ baseUrl: 'http://x', fetchImpl });
    expect((await client.list().catch((error) => error)).message).toBe('HTTP 500');
    const down = await client.list().catch((error) => error);
    expect(down.message).toContain('serveur d’état injoignable');
    expect(down.status).toBe(0);
  });
});

describe('vue de la médiathèque', () => {
  test('formatBytes : octets, Ko, Mo avec virgule', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2,5 Mo');
  });

  test('describeAsset : dimensions, poids, usages au singulier et au pluriel', () => {
    const base = { width: 1920, height: 1080, bytes: 340 * 1024 };
    expect(describeAsset({ ...base, uses: 0 })).toBe('1920×1080 · 340 Ko · inutilisée');
    expect(describeAsset({ ...base, uses: 1 })).toBe('1920×1080 · 340 Ko · utilisée 1 fois');
    expect(describeAsset({ ...base, uses: 3 })).toBe('1920×1080 · 340 Ko · utilisée 3 fois');
  });

  test('pickImageFiles garde les images acceptées et compte le reste', () => {
    const files = [{ name: 'a.png', type: 'image/png' }, { name: 'b.svg', type: 'image/svg+xml' }, { name: 'c.txt', type: 'text/plain' }, { name: 'd.webp', type: 'image/webp' }];
    const { images, ignored } = pickImageFiles(files);
    expect(images.map((file) => file.name)).toEqual(['a.png', 'd.webp']);
    expect(ignored).toBe(2);
    expect(ACCEPTED_IMAGE_TYPES).not.toContain('svg');
  });

  test('summarizeImport décrit ce qui s’est passé, sans rien taire', () => {
    expect(summarizeImport({ added: 2, known: 1, failed: [], ignored: 0 })).toBe('2 images importées · 1 image était déjà là.');
    expect(summarizeImport({ added: 0, known: 0, failed: ['x.png : image illisible'], ignored: 2 })).toBe('2 fichiers ignorés (ni images ni polices) · refusé : x.png : image illisible.');
    expect(summarizeImport({ added: 1, known: 0, failed: [], ignored: 1 })).toBe('1 image importée · 1 fichier ignoré (ce n’est ni une image ni une police).');
    expect(summarizeImport({ added: 0, known: 0, failed: [], ignored: 0 })).toBe('Aucun fichier à importer.');
  });
});

describe('vue de la médiathèque : polices', () => {
  test('describeAsset : une police dit son format, pas ses dimensions', () => {
    expect(describeAsset({ type: 'woff2', width: 0, height: 0, bytes: 40 * 1024, uses: 1 })).toBe('police WOFF2 · 40 Ko · utilisée 1 fois');
    expect(describeAsset({ type: 'png', width: 640, height: 360, bytes: 2048, uses: 0 })).toBe('640×360 · 2 Ko · inutilisée');
  });

  test('pickImageFiles garde aussi les polices, reconnues à leur extension (le navigateur ne leur donne souvent aucun type)', () => {
    const files = [{ name: 'Bebas.TTF', type: '' }, { name: 'a.woff2', type: 'font/woff2' }, { name: 'b.png', type: 'image/png' }, { name: 'c.exe', type: 'application/x-msdownload' }];
    const { images, ignored } = pickImageFiles(files);
    expect(images.map((file) => file.name)).toEqual(['Bebas.TTF', 'a.woff2', 'b.png']);
    expect(ignored).toBe(1);
  });

  test('summarizeImport parle de fichiers dès qu’une police s’y mêle, au masculin', () => {
    expect(summarizeImport({ added: 2, known: 1, failed: [], ignored: 0, noun: 'fichier' })).toBe('2 fichiers importés · 1 fichier était déjà là.');
    expect(summarizeImport({ added: 1, known: 0, failed: [], ignored: 0, noun: 'fichier' })).toBe('1 fichier importé.');
  });
});
