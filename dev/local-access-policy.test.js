import { expect, test } from 'bun:test';
import { networkInterfaces } from 'node:os';
import { isLocalHost, isLocalOrigin, isServablePath, rejectNonLocalRequest } from './local-access-policy.js';

const request = (url, headers = {}) => new Request(url, { headers });

test('seuls les fichiers de l’overlay sont servables', () => {
  for (const path of [
    '/background.html', '/tokens.css', '/ports.config.js', '/components/RainBackground.js',
    '/components/color-palette.json', '/dev/studio.html', '/dev/background-tuner-runtime.js',
  ]) {
    expect(isServablePath(path)).toBe(true);
  }
});

test('secrets, dépôt git, docs et état persisté ne sont jamais servables', () => {
  for (const path of [
    '/.env', '/.env.example', '/.git/config', '/.claude/launch.json', '/.gitignore',
    '/dev/data/background-state.json', '/dev/data/', '/src-tauri/Cargo.toml',
    '/docs/security.md', '/AGENTS.md', '/CLAUDE.md', '/README.md', '/kill-servers.bat',
    '/node_modules/x/index.js', '/components/.hidden.js',
  ]) {
    expect(isServablePath(path)).toBe(false);
  }
});

test('les contournements de chemin sont refusés', () => {
  for (const path of [
    '/components/../.env', '/%2e%65nv', '/%2E%2E/.env', '/dev/data%2Fbackground-state.json',
    '/components/%2e%2e/.git/config', '/dev\\data\\background-state.json', '/background.html%00.png',
    '/components/%zz.js', '//.env',
  ]) {
    expect(isServablePath(path)).toBe(false);
  }
});

test('Host : seule la boucle locale est acceptée (anti DNS rebinding)', () => {
  for (const host of ['localhost:5931', '127.0.0.1:5932', '[::1]:5931', 'localhost']) {
    expect(isLocalHost(host)).toBe(true);
  }
  for (const host of ['evil.example:5931', '192.168.1.20:5931', 'localhost.evil.example', '', null]) {
    expect(isLocalHost(host)).toBe(false);
  }
});

test('Origin : seules les pages locales sont acceptées', () => {
  for (const origin of ['http://localhost:5931', 'http://127.0.0.1:5931', 'http://[::1]:5931', 'http://tauri.localhost']) {
    expect(isLocalOrigin(origin)).toBe(true);
  }
  for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'http://192.168.1.20:5931', 'null', 'file://', 'notaurl']) {
    expect(isLocalOrigin(origin)).toBe(false);
  }
});

test('rejectNonLocalRequest : refuse Origin étrangère et Host étranger, laisse passer le reste', () => {
  expect(rejectNonLocalRequest(request('http://localhost:5932/state', { Origin: 'http://localhost:5931' }))).toBeNull();
  expect(rejectNonLocalRequest(request('http://localhost:5932/state'))).toBeNull();
  expect(rejectNonLocalRequest(request('http://localhost:5932/state', { Origin: 'https://evil.example' }))?.status).toBe(403);
  expect(rejectNonLocalRequest(request('http://evil.example:5932/state'))?.status).toBe(403);
});

test('rejectNonLocalRequest : anyOrigin laisse l’Origin libre, jamais le Host', () => {
  const option = { anyOrigin: true };
  expect(rejectNonLocalRequest(request('http://localhost:5932/', { Origin: 'https://twitchat.fr' }), option)).toBeNull();
  expect(rejectNonLocalRequest(request('http://localhost:5932/'), option)).toBeNull();
  expect(rejectNonLocalRequest(request('http://evil.example:5932/', { Origin: 'https://twitchat.fr' }), option)?.status).toBe(403);
  expect(rejectNonLocalRequest(request('http://localhost:5932/', { Origin: 'https://twitchat.fr' }), { anyOrigin: false })?.status).toBe(403);
});

const lanAddress = Object.values(networkInterfaces()).flat()
  .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;

test.skipIf(lanAddress === undefined)('static-server : fichiers de l’overlay servis, secrets refusés, injoignable depuis l’adresse réseau', async () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('probe') });
  const { port } = probe;
  await probe.stop(true);
  const child = Bun.spawn(['bun', 'dev/static-server.js'], {
    cwd: `${import.meta.dir}/..`,
    env: { ...process.env, STATIC_PORT: String(port) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/background.html`)).ok; } catch { await Bun.sleep(30); }
    }
    expect(ready).toBe(true);

    for (const path of ['/.env', '/.git/config', '/dev/data/background-state.json', '/src-tauri/Cargo.toml', '/docs/security.md']) {
      expect((await fetch(`http://127.0.0.1:${port}${path}`)).status).toBe(404);
    }
    expect((await fetch(`http://127.0.0.1:${port}/background.html`, { headers: { Host: 'evil.example' } })).status).toBe(403);

    const reachable = await fetch(`http://${lanAddress}:${port}/background.html`).then(() => true, () => false);
    expect(reachable).toBe(false);
  } finally {
    child.kill();
  }
});
