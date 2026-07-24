# Fonds réactifs (background-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amener les événements stream (`follow`/`sub`/`raid`/`bits`) jusqu'à `background.html` en mode background-only et les traduire en réactions visuelles, natives sur DotGrid et via un overlay partagé sur tous les autres effets.

**Architecture:** Le serveur d'état (seul process live) gagne `POST /event` → diffusion `WS /event-ws`. `background.html` et l'aperçu du tuner s'y abonnent et relaient chaque événement à un coordinateur : réaction native si l'effet monté expose `trigger()`, sinon un `ReactionOverlay` partagé. Le tuner ajoute 4 boutons de test qui postent sur `/event` (donc l'URL OBS réagit aussi).

**Tech Stack:** HTML/CSS/JS natif, ES modules, Bun (runtime + `bun:test`), Canvas 2D. Zéro dépendance npm, zéro build.

## Global Constraints

- Zéro dépendance externe, zéro build — HTML/CSS/JS natif uniquement.
- Composants = factory `{ el, update?, destroy? }` (ici `ReactionOverlay` expose `{ el, trigger, destroy }`).
- `@ts-check` en tête de chaque module JS ; types explicites en JSDoc.
- Toute boucle `requestAnimationFrame` doit être nettoyée dans `destroy()`.
- Couleurs : réutiliser `resolveColor` + `var(--color-gold)`, jamais de hex codé en dur.
- Tests : `import { expect, test } from 'bun:test';` — logique pure isolée du DOM ; ne PAS instancier de composant canvas dans `bun test` (aucun DOM), tester uniquement les helpers/état exportés.
- Serveur : mêmes conventions que les routes existantes (`jsonError`, `CORS_HEADERS`, table `POST_ROUTES`, `server.upgrade` par `data.channel`).
- Événements **éphémères** : jamais écrits dans `background-state.json`, jamais dédupliqués, jamais rejoués.
- Vérification : `bun test` vert + vérif visuelle live (bouton test → réaction sur `background.html` en Browser Source, DotGrid natif ET un effet non-DotGrid via overlay).

---

### Task 1: Validation d'événement (pure)

**Files:**
- Create: `dev/background-event-format.js`
- Test: `dev/background-event-format.test.js`

**Interfaces:**
- Produces: `VALID_EVENT_TYPES: readonly string[]`, `validateBackgroundEvent(body: unknown): { ok: boolean, errors: string[] }`

- [ ] **Step 1: Write the failing test**

```js
// dev/background-event-format.test.js
import { expect, test } from 'bun:test';
import { validateBackgroundEvent, VALID_EVENT_TYPES } from './background-event-format.js';

test('[validateBackgroundEvent] les 4 types valides sont acceptés', () => {
  for (const type of VALID_EVENT_TYPES) {
    expect(validateBackgroundEvent({ type })).toEqual({ ok: true, errors: [] });
  }
});

test('[validateBackgroundEvent] champs optionnels tolérés', () => {
  expect(validateBackgroundEvent({ type: 'sub', username: 'x', amount: 3, timestamp: 1 }).ok).toBe(true);
});

test('[validateBackgroundEvent] type inconnu rejeté', () => {
  const result = validateBackgroundEvent({ type: 'donation' });
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['type d’événement inconnu : donation']);
});

test('[validateBackgroundEvent] type manquant rejeté', () => {
  expect(validateBackgroundEvent({}).ok).toBe(false);
});

test('[validateBackgroundEvent] corps non-objet rejeté', () => {
  expect(validateBackgroundEvent(null).ok).toBe(false);
  expect(validateBackgroundEvent('sub').ok).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test dev/background-event-format.test.js`
Expected: FAIL — `Cannot find module './background-event-format.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// dev/background-event-format.js
// @ts-check
/**
 * background-event-format.js — Validation pure d'un événement de réaction (2026-07-24).
 *
 * Corps de `POST /event` du serveur d'état. Réutilise la forme `AlertEvent` (types.js) : seul `type`
 * est requis, les autres champs sont transmis tels quels et ignorés par les réactions visuelles.
 * Voir docs/specs/background-reactive-events.md.
 */

/** @type {readonly string[]} */
export const VALID_EVENT_TYPES = ['follow', 'sub', 'raid', 'bits'];

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBackgroundEvent(body) {
  /** @type {string[]} */
  const errors = [];
  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: ['corps d’événement invalide (objet attendu)'] };
  }
  const type = /** @type {Record<string, unknown>} */ (body).type;
  if (typeof type !== 'string' || type.length === 0) {
    errors.push('type d’événement manquant');
  } else if (!VALID_EVENT_TYPES.includes(type)) {
    errors.push(`type d’événement inconnu : ${type}`);
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test dev/background-event-format.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add dev/background-event-format.js dev/background-event-format.test.js
git commit -m "feat: validation pure des événements de réaction du fond"
```

---

### Task 2: Route `POST /event` + `WS /event-ws`

**Files:**
- Modify: `dev/background-state-server.js`
- Test: `dev/background-state-server.test.js` (ajouter un test)

**Interfaces:**
- Consumes: `validateBackgroundEvent` (Task 1)
- Produces: `POST /event` (400 si invalide, sinon diffuse) ; `WS /event-ws` (diffuse l'événement JSON)

- [ ] **Step 1: Write the failing test** (ajouter à la fin de `dev/background-state-server.test.js`, après le test existant)

```js
test('POST /event valide diffuse une fois sans toucher le fichier ; invalide → 400 sans diffusion', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-event-'));
  const stateFile = join(directory, 'state.json');
  const port = 43000 + (process.pid % 10000);
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(baseUrl);
    const before = await (await fetch(`${baseUrl}/state`)).text();

    const messages = [];
    const socket = new WebSocket(`ws://localhost:${port}/event-ws`);
    socket.onmessage = (event) => messages.push(event.data);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

    const invalid = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'donation' }),
    });
    expect(invalid.status).toBe(400);
    await delay(60);
    expect(messages).toEqual([]);

    const valid = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'raid', username: 'z' }),
    });
    expect(valid.ok).toBe(true);
    await delay(60);
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: 'raid', username: 'z' });

    const after = await (await fetch(`${baseUrl}/state`)).text();
    expect(after).toBe(before);
    socket.close();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test dev/background-state-server.test.js`
Expected: FAIL — `/event` renvoie 404 (route absente), l'assertion `invalid.status === 400` échoue.

- [ ] **Step 3: Write minimal implementation** — 4 éditions dans `dev/background-state-server.js` :

3a. Ajouter l'import (après la ligne `import { CORS_HEADERS, jsonError } from './dev-server-shared.js';`) :

```js
import { validateBackgroundEvent } from './background-event-format.js';
```

3b. Étendre `BackgroundSocketData` et déclarer le Set des clients événement (après `const presetClients = new Set();`) :

```js
/** @typedef {{ channel: 'state'|'presets'|'event' }} BackgroundSocketData */

/** @type {Set<import('bun').ServerWebSocket<BackgroundSocketData>>} */
const eventClients = new Set();

/** @param {Record<string, unknown>} event */
function broadcastEvent(event) {
  const payload = JSON.stringify(event);
  eventClients.forEach((client) => client.send(payload));
}
```

3c. Ajouter le handler (après `handleDeletePreset`) et l'enregistrer dans `POST_ROUTES` :

```js
/**
 * POST /event — événement de réaction éphémère : validé puis diffusé, jamais persisté.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handlePostEvent(req) {
  const body = /** @type {*} */ (await req.json());
  const validation = validateBackgroundEvent(body);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
  broadcastEvent(body);
  return new Response('ok', { headers: CORS_HEADERS });
}
```

```js
/** @type {Record<string, (req: Request) => Promise<Response>>} */
const POST_ROUTES = {
  '/state': handlePostState,
  '/save-preset': handleSavePreset,
  '/rename-preset': handleRenamePreset,
  '/duplicate-preset': handleDuplicatePreset,
  '/preview-import': handlePreviewImport,
  '/import-presets': handleImportPresets,
  '/delete-preset': handleDeletePreset,
  '/event': handlePostEvent,
};
```

3d. Gérer l'upgrade WS `/event-ws` et l'enregistrement du client. Remplacer le bloc d'upgrade dans `fetch` :

```js
    if (url.pathname === '/state-ws' || url.pathname === '/presets-ws' || url.pathname === '/event-ws') {
      const channel = url.pathname === '/state-ws' ? 'state' : url.pathname === '/presets-ws' ? 'presets' : 'event';
      const upgraded = server.upgrade(req, { data: { channel } });
      return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
    }
```

et dans `websocket.open` / `websocket.close` :

```js
    open(ws) {
      if (ws.data.channel === 'state') stateClients.add(ws);
      else if (ws.data.channel === 'presets') presetClients.add(ws);
      else eventClients.add(ws);
    },
    close(ws) {
      stateClients.delete(ws);
      presetClients.delete(ws);
      eventClients.delete(ws);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test dev/background-state-server.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add dev/background-state-server.js dev/background-state-server.test.js
git commit -m "feat: canal /event éphémère sur le serveur d'état du fond"
```

---

### Task 3: ReactionOverlay — helpers, ordonnanceur, boucle

**Files:**
- Create: `components/ReactionOverlay.js`
- Test: `components/ReactionOverlay.test.js`

**Interfaces:**
- Produces:
  - `reactionDuration(type: string): number | null`
  - `followRadius(progress: number, diagonal: number): number`
  - `pulseAlpha(progress: number, max?: number): number`
  - `raidBandCenter(progress: number, cssW: number, bandWidth: number): number`
  - `bitsCount(random?: () => number): number` (18–32)
  - `createReactionScheduler(): { trigger(type, now): boolean, sample(now): { type, progress } | null, readonly isActive }`
  - `createReactionLoop(deps): { trigger(type): boolean, stop(): void, readonly running }`
  - `ReactionOverlay(options?): { el, trigger(event), destroy() }`

- [ ] **Step 1: Write the failing test**

```js
// components/ReactionOverlay.test.js
import { expect, test } from 'bun:test';
import {
  reactionDuration, followRadius, pulseAlpha, raidBandCenter, bitsCount,
  createReactionScheduler, createReactionLoop,
} from './ReactionOverlay.js';

test('[reactionDuration] durée par type, null si inconnu', () => {
  expect(reactionDuration('follow')).toBe(1800);
  expect(reactionDuration('sub')).toBe(1600);
  expect(reactionDuration('raid')).toBe(2600);
  expect(reactionDuration('bits')).toBe(1400);
  expect(reactionDuration('donation')).toBeNull();
});

test('[followRadius] croît de 0 à la diagonale', () => {
  expect(followRadius(0, 2000)).toBe(0);
  expect(followRadius(1, 2000)).toBe(2000);
});

test('[pulseAlpha] suit sin(π·progress), nul aux bornes, max au milieu', () => {
  expect(pulseAlpha(0)).toBeCloseTo(0);
  expect(pulseAlpha(1)).toBeCloseTo(0);
  expect(pulseAlpha(0.5, 0.3)).toBeCloseTo(0.3);
});

test('[raidBandCenter] balaie de -bande à cssW+bande', () => {
  expect(raidBandCenter(0, 1920, 288)).toBe(-288);
  expect(raidBandCenter(1, 1920, 288)).toBe(1920 + 288);
});

test('[bitsCount] entre 18 et 32', () => {
  expect(bitsCount(() => 0)).toBe(18);
  expect(bitsCount(() => 0.999)).toBe(32);
});

test('[createReactionScheduler] inactif au repos, type inconnu = no-op', () => {
  const s = createReactionScheduler();
  expect(s.isActive).toBe(false);
  expect(s.trigger('donation', 0)).toBe(false);
  expect(s.isActive).toBe(false);
});

test('[createReactionScheduler] sample renvoie la progression puis se termine', () => {
  const s = createReactionScheduler();
  expect(s.trigger('bits', 1000)).toBe(true);
  expect(s.isActive).toBe(true);
  expect(s.sample(1000)).toEqual({ type: 'bits', progress: 0 });
  expect(s.sample(1700)).toEqual({ type: 'bits', progress: 0.5 });
  expect(s.sample(2400)).toBeNull();
  expect(s.isActive).toBe(false);
});

test('[createReactionLoop] ne demande aucune frame avant trigger, s’arrête à la fin', () => {
  let time = 0;
  const requested = [];
  const cancelled = [];
  const scheduler = createReactionScheduler();
  const loop = createReactionLoop({
    scheduler,
    now: () => time,
    requestFrame: (cb) => { requested.push(cb); return requested.length; },
    cancelFrame: (id) => cancelled.push(id),
    onFrame: () => {},
    onStop: () => {},
  });
  expect(requested).toHaveLength(0);

  expect(loop.trigger('follow')).toBe(true); // durée 1800
  expect(loop.running).toBe(true);
  expect(requested).toHaveLength(1);

  time = 900; requested[requested.length - 1](); // encore actif → redemande
  expect(loop.running).toBe(true);
  expect(requested).toHaveLength(2);

  time = 1800; requested[requested.length - 1](); // terminé → stop
  expect(loop.running).toBe(false);
  expect(requested).toHaveLength(2);
});

test('[createReactionLoop] stop annule la frame en cours', () => {
  const scheduler = createReactionScheduler();
  const cancelled = [];
  const loop = createReactionLoop({
    scheduler,
    now: () => 0,
    requestFrame: () => 42,
    cancelFrame: (id) => cancelled.push(id),
    onFrame: () => {},
    onStop: () => {},
  });
  loop.trigger('sub');
  loop.stop();
  expect(cancelled).toEqual([42]);
  expect(loop.running).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test components/ReactionOverlay.test.js`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Write minimal implementation**

```js
// components/ReactionOverlay.js
// @ts-check
import { resolveColor } from './color-utils.js';
import { canvasPixelRatio } from './canvas-runtime.js';

/**
 * ReactionOverlay.js — Couche de réaction partagée pour le mode fond autonome (2026-07-24).
 *
 * Canvas transparent plein cadre dessinant une réaction en or Atelier par-dessus n'importe quel
 * effet de fond. Utilisée quand l'effet monté n'expose pas `trigger()` (routage dans
 * background-reactions.js). RAF paresseux : démarre au trigger, s'arrête dès qu'aucune réaction
 * n'est active. Voir docs/specs/background-reactive-events.md.
 */

/** @type {Record<string, number>} */
export const REACTION_DURATIONS = { follow: 1800, sub: 1600, raid: 2600, bits: 1400 };

/** @param {string} type @returns {number | null} */
export function reactionDuration(type) {
  return Object.prototype.hasOwnProperty.call(REACTION_DURATIONS, type) ? REACTION_DURATIONS[type] : null;
}

/** @param {number} progress @param {number} diagonal */
export function followRadius(progress, diagonal) { return progress * diagonal; }

/** @param {number} progress @param {number} [max] */
export function pulseAlpha(progress, max = 0.28) { return Math.sin(progress * Math.PI) * max; }

/** @param {number} progress @param {number} cssW @param {number} bandWidth */
export function raidBandCenter(progress, cssW, bandWidth) { return -bandWidth + progress * (cssW + 2 * bandWidth); }

/** @param {() => number} [random] @returns {number} 18 à 32 */
export function bitsCount(random = Math.random) { return 18 + Math.floor(random() * 15); }

/**
 * État pur d'une réaction unique active à la fois.
 * @returns {{ trigger(type: string, now: number): boolean, sample(now: number): { type: string, progress: number } | null, readonly isActive: boolean }}
 */
export function createReactionScheduler() {
  /** @type {{ type: string, startTime: number, duration: number } | null} */
  let active = null;
  return {
    trigger(type, now) {
      const duration = reactionDuration(type);
      if (duration === null) return false;
      active = { type, startTime: now, duration };
      return true;
    },
    sample(now) {
      if (active === null) return null;
      const progress = (now - active.startTime) / active.duration;
      if (progress >= 1) { active = null; return null; }
      return { type: active.type, progress };
    },
    get isActive() { return active !== null; },
  };
}

/**
 * Boucle RAF paresseuse (sans DOM), pilotée par un ordonnanceur. Frames injectées pour les tests.
 * @param {{
 *   scheduler: ReturnType<typeof createReactionScheduler>,
 *   now: () => number,
 *   requestFrame: (cb: () => void) => number,
 *   cancelFrame: (id: number) => void,
 *   onFrame: (sample: { type: string, progress: number }) => void,
 *   onStop?: () => void,
 * }} deps
 */
export function createReactionLoop(deps) {
  let rafId = 0;
  let running = false;
  function step() {
    const sample = deps.scheduler.sample(deps.now());
    if (sample === null) { running = false; rafId = 0; deps.onStop?.(); return; }
    rafId = deps.requestFrame(step);
    deps.onFrame(sample);
  }
  return {
    /** @param {string} type */
    trigger(type) {
      if (!deps.scheduler.trigger(type, deps.now())) return false;
      if (!running) { running = true; rafId = deps.requestFrame(step); }
      return true;
    },
    stop() { if (rafId !== 0) deps.cancelFrame(rafId); rafId = 0; running = false; },
    get running() { return running; },
  };
}

/**
 * @param {{ color?: string, requestFrame?: (cb: () => void) => number, cancelFrame?: (id: number) => void, now?: () => number }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function ReactionOverlay(options = {}) {
  const requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  const now = options.now ?? (() => performance.now());
  let rgb = resolveColor(options.color ?? 'var(--color-gold)');

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let corner = { x: 0, y: 0 };
  /** @type {{ fx: number, fy: number, r: number, delay: number }[]} */
  let bits = [];

  const scheduler = createReactionScheduler();
  const loop = createReactionLoop({
    scheduler, now, requestFrame, cancelFrame,
    onFrame: render,
    onStop: () => ctx.clearRect(0, 0, cssW, cssH),
  });

  function resize() {
    const dpr = canvasPixelRatio();
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    cssW = w; cssH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** @param {{ type: string, progress: number }} sample */
  function render(sample) {
    ctx.clearRect(0, 0, cssW, cssH);
    const [r, g, b] = rgb;
    if (sample.type === 'follow') {
      const diagonal = Math.hypot(cssW, cssH);
      const radius = followRadius(sample.progress, diagonal);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - sample.progress) * 0.9})`;
      ctx.lineWidth = (1 - sample.progress) * 3 + 0.5;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sample.type === 'sub') {
      ctx.fillStyle = `rgba(${r},${g},${b},${pulseAlpha(sample.progress).toFixed(3)})`;
      ctx.fillRect(0, 0, cssW, cssH);
    } else if (sample.type === 'raid') {
      const bandWidth = cssW * 0.15;
      const center = raidBandCenter(sample.progress, cssW, bandWidth);
      const gradient = ctx.createLinearGradient(center - bandWidth / 2, 0, center + bandWidth / 2, 0);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.5)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(center - bandWidth / 2, 0, bandWidth, cssH);
    } else if (sample.type === 'bits') {
      for (const bit of bits) {
        const local = Math.max(0, Math.min(1, (sample.progress - bit.delay) / (1 - bit.delay)));
        const alpha = pulseAlpha(local, 0.9);
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(bit.fx * cssW, bit.fy * cssH, bit.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} event */
    trigger(event) {
      const type = /** @type {{ type?: string }} */ (event ?? {}).type;
      if (typeof type !== 'string' || reactionDuration(type) === null) return;
      if (cssW === 0) resize();
      if (type === 'follow') {
        corner = { x: Math.random() < 0.5 ? 0 : cssW, y: Math.random() < 0.5 ? 0 : cssH };
      } else if (type === 'bits') {
        const count = bitsCount();
        bits = Array.from({ length: count }, () => ({
          fx: Math.random(), fy: Math.random(), r: 1.5 + Math.random() * 2.5, delay: Math.random() * 0.4,
        }));
      }
      loop.trigger(type);
    },
    destroy() {
      loop.stop();
      observer.disconnect();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test components/ReactionOverlay.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ReactionOverlay.js components/ReactionOverlay.test.js
git commit -m "feat: overlay de réaction partagé pour les fonds"
```

---

### Task 4: `background-mount.react()`

**Files:**
- Modify: `background-mount.js:56-71` (bloc `return { ... }`)
- Test: `background-mount.test.js`

**Interfaces:**
- Produces: `mount.react(event: unknown): boolean` — `true` si l'effet monté expose `trigger` (et l'appelle), `false` sinon.

- [ ] **Step 1: Write the failing test** (ajouter un `describe` à `background-mount.test.js`)

```js
describe('background mount react routing', () => {
  test('react retourne true et appelle trigger quand l’effet l’expose', () => {
    const calls = [];
    const container = { appendChild: () => {} };
    const registry = {
      DotGridBackground: () => ({
        el: { name: 'dot', remove: () => {} },
        trigger: (event) => calls.push(event.type),
      }),
    };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'DotGridBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(true);
    expect(calls).toEqual(['raid']);
  });

  test('react retourne false quand l’effet n’expose pas trigger', () => {
    const container = { appendChild: () => {} };
    const registry = { RainBackground: () => ({ el: { name: 'rain', remove: () => {} } }) };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ (registry));
    mount.apply({ component: 'RainBackground', options: {} });
    expect(mount.react({ type: 'raid' })).toBe(false);
  });

  test('react retourne false quand rien n’est monté', () => {
    const container = { appendChild: () => {} };
    const mount = createBackgroundMount(/** @type {*} */ (container), /** @type {*} */ ({}));
    expect(mount.react({ type: 'raid' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test background-mount.test.js`
Expected: FAIL — `mount.react is not a function`.

- [ ] **Step 3: Write minimal implementation** — ajouter la méthode `react` dans l'objet retourné par `createBackgroundMount` (avant `destroy()`), `background-mount.js` :

```js
    react(event) {
      if (instance !== null && typeof instance.trigger === 'function') {
        instance.trigger(event);
        return true;
      }
      return false;
    },
```

Et compléter la signature JSDoc du retour (`@returns`) pour inclure `react(event: unknown): boolean`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test background-mount.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add background-mount.js background-mount.test.js
git commit -m "feat: mount.react route un événement vers la réaction native"
```

---

### Task 5: Coordinateur de réactions

**Files:**
- Create: `background-reactions.js`
- Test: `background-reactions.test.js`

**Interfaces:**
- Consumes: `mount.react(event): boolean` (Task 4), `overlay.trigger(event)` (Task 3)
- Produces: `createReactionCoordinator({ mount, overlay }): { handle(event): void }`

- [ ] **Step 1: Write the failing test**

```js
// background-reactions.test.js
import { expect, test } from 'bun:test';
import { createReactionCoordinator } from './background-reactions.js';

test('[handle] réaction native → l’overlay n’est pas sollicité', () => {
  const overlayCalls = [];
  const coordinator = createReactionCoordinator({
    mount: { react: () => true },
    overlay: { trigger: (e) => overlayCalls.push(e) },
  });
  coordinator.handle({ type: 'sub' });
  expect(overlayCalls).toEqual([]);
});

test('[handle] pas de réaction native → l’overlay joue', () => {
  const overlayCalls = [];
  const coordinator = createReactionCoordinator({
    mount: { react: () => false },
    overlay: { trigger: (e) => overlayCalls.push(e) },
  });
  coordinator.handle({ type: 'bits' });
  expect(overlayCalls).toEqual([{ type: 'bits' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test background-reactions.test.js`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Write minimal implementation**

```js
// background-reactions.js
// @ts-check
/**
 * background-reactions.js — Routage d'un événement de réaction (2026-07-24).
 *
 * Réaction native si l'effet monté l'expose (DotGrid), sinon overlay partagé. Partagé par
 * background.html (URL OBS) et l'aperçu du tuner pour un comportement identique.
 * Voir docs/specs/background-reactive-events.md.
 *
 * @param {{
 *   mount: { react: (event: unknown) => boolean },
 *   overlay: { trigger: (event: unknown) => void },
 * }} deps
 */
export function createReactionCoordinator(deps) {
  return {
    /** @param {unknown} event */
    handle(event) {
      if (!deps.mount.react(event)) deps.overlay.trigger(event);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test background-reactions.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add background-reactions.js background-reactions.test.js
git commit -m "feat: coordinateur natif/overlay des réactions de fond"
```

---

### Task 6: Client — `sendEvent` + abonnement `/event-ws`

**Files:**
- Modify: `dev/background-state-client.js`

**Interfaces:**
- Produces: `client.sendEvent(type: string): Promise<unknown>` ; `subscribe` accepte un `onEvent?` optionnel branché sur `/event-ws`.

- [ ] **Step 1: Ajouter `sendEvent`** dans l'objet retourné (après `importPresets`), `dev/background-state-client.js` :

```js
    /** @param {string} type */
    sendEvent(type) {
      return request('event', { type });
    },
```

- [ ] **Step 2: Brancher `onEvent`** dans `subscribe`. Étendre le typedef des `listeners` avec `onEvent?: (event: unknown) => void`, puis après `connect('presets-ws', listeners.onPresets);` :

```js
      if (listeners.onEvent) connect('event-ws', listeners.onEvent);
```

- [ ] **Step 3: Vérifier la non-régression**

Run: `bun test dev/background-state-client.test.js`
Expected: PASS (les tests existants ne cassent pas ; `onEvent` optionnel).

- [ ] **Step 4: Commit**

```bash
git add dev/background-state-client.js
git commit -m "feat: sendEvent et abonnement /event-ws côté client du tuner"
```

---

### Task 7: `background.html` — overlay + abonnement événements

**Files:**
- Modify: `background.html`

**Interfaces:**
- Consumes: `ReactionOverlay` (Task 3), `createReactionCoordinator` (Task 5), `/event-ws` (Task 2).

- [ ] **Step 1: Importer et monter l'overlay + le coordinateur.** Dans le `<script type="module">`, après la création de `mount` :

```js
    import { ReactionOverlay } from './components/ReactionOverlay.js';
    import { createReactionCoordinator } from './background-reactions.js';
    // ... (imports existants en tête du module)

    const overlay = ReactionOverlay();
    document.getElementById('bg-layer').appendChild(overlay.el);
    const coordinator = createReactionCoordinator({ mount, overlay });
```

> `overlay.el` est ajouté DANS `#bg-layer` (après l'effet), donc au-dessus dans l'ordre DOM ; `?transparent=1` ne l'affecte pas (canvas transparent).

- [ ] **Step 2: Abonnement `/event-ws`** — ajouter une connexion dédiée, indépendante de `state-ws`/`presets-ws` (les événements sont orthogonaux au mode preset). Après la définition de `connect()` :

```js
    /** Réactions : canal séparé, actif quel que soit le mode (courant ou preset). */
    function connectEvents(delayMs = 1000) {
      const ws = new WebSocket('ws://localhost:4462/event-ws');
      ws.onopen = () => { delayMs = 1000; };
      ws.onmessage = (event) => {
        try {
          coordinator.handle(JSON.parse(event.data));
        } catch (err) {
          console.error('[background] événement invalide :', err);
        }
      };
      ws.onclose = () => setTimeout(() => connectEvents(Math.min(delayMs * 2, 30000)), delayMs);
    }
```

et l'appeler à côté de `connect();` :

```js
    connect();
    connectEvents();
```

- [ ] **Step 3: Vérification manuelle live**

```
bun dev/background-state-server.js        # port 4462
bunx serve                                 # sert background.html
```

- Ouvrir `http://localhost:3000/background.html` (ou le port servi).
- `curl -X POST http://localhost:4462/event -H 'Content-Type: application/json' -d '{"type":"raid"}'`
- Avec `current.component = DotGridBackground` → réaction **native** (grille). Avec un effet sans `trigger` (ex : `RainBackground`) → **overlay** (bande dorée).
- Expected : une réaction visible par type, aucune erreur console, retour au repos ensuite.

- [ ] **Step 4: Commit**

```bash
git add background.html
git commit -m "feat: background.html réagit aux événements via overlay/natif"
```

---

### Task 8: Tuner — boutons de test + réaction de l'aperçu

**Files:**
- Modify: `dev/background-preview-controller.js` (overlay + `react` sur l'aperçu)
- Modify: `dev/background-tuner.html` (section « Tester une réaction »)
- Modify: `dev/background-tuner-runtime.js` (câblage boutons + abonnement `onEvent`)

**Interfaces:**
- Consumes: `client.sendEvent` / `subscribe({ onEvent })` (Task 6), `ReactionOverlay` + `createReactionCoordinator`.
- Produces: `preview.react(event): void`.

- [ ] **Step 1: L'aperçu réagit.** Dans `dev/background-preview-controller.js`, importer et monter un overlay + coordinateur sur `input.layer`, exposer `react`. Après `const mount = createBackgroundMount(input.layer);` :

```js
import { ReactionOverlay } from '../components/ReactionOverlay.js';
import { createReactionCoordinator } from '../background-reactions.js';
// ...
  const overlay = ReactionOverlay();
  input.layer.appendChild(overlay.el);
  const reactions = createReactionCoordinator({ mount, overlay });
```

Ajouter `react: reactions.handle,` dans l'objet retourné, et `overlay.destroy();` dans `destroy()`.

- [ ] **Step 2: Markup des boutons.** Dans `dev/background-tuner.html`, ajouter une section dans la sidebar (près des contrôles d'effet) :

```html
<section class="tuner-section">
  <h2 class="label-mono">Tester une réaction</h2>
  <div class="reaction-buttons">
    <button type="button" data-event="follow">Follow</button>
    <button type="button" data-event="sub">Sub</button>
    <button type="button" data-event="raid">Raid</button>
    <button type="button" data-event="bits">Bits</button>
  </div>
</section>
```

(Réutiliser les classes de bouton existantes de la page ; suivre le style de section déjà présent.)

- [ ] **Step 3: Câblage.** Dans `dev/background-tuner-runtime.js` :

3a. Boutons → `client.sendEvent` (après la création de `preview`) :

```js
  for (const button of documentRef.querySelectorAll('[data-event]')) {
    button.addEventListener('click', () => {
      client.sendEvent(button.getAttribute('data-event')).catch((error) => {
        console.warn('[background-tuner] envoi d’événement impossible :', error);
      });
    });
  }
```

3b. Abonnement `onEvent` → aperçu, dans l'objet passé à `client.subscribe` :

```js
  const unsubscribe = client.subscribe({
    onCurrent: preview.receive,
    onPresets: presets.refresh,
    onEvent: preview.react,
    onError(error) {
      console.warn('[background-tuner] message temps réel invalide :', error);
    },
  });
```

- [ ] **Step 4: Vérification** — `bun test` (aucune régression), puis manuel : cliquer chaque bouton du tuner → l'aperçu réagit ET, si `background.html` est ouvert en parallèle, l'URL OBS réagit aussi (l'événement passe par le serveur).

Run: `bun test`
Expected: PASS (toute la suite verte).

- [ ] **Step 5: Commit**

```bash
git add dev/background-preview-controller.js dev/background-tuner.html dev/background-tuner-runtime.js
git commit -m "feat: boutons de test de réaction et aperçu réactif dans le tuner"
```

---

## Self-Review

**Spec coverage :**
- POST /event + WS /event-ws (AC-07/08/09) → Task 2. Validation (AC-06) → Task 1.
- Overlay 4 réactions + no-op + RAF paresseux + destroy (AC-01→05, 12, 13) → Task 3.
- `mount.react` (AC-10) → Task 4. Coordinateur (AC-11) → Task 5.
- `background.html` réactif → Task 7. Boutons test + aperçu → Task 8. Client → Task 6.
- Éphémère (pas d'écriture disque) : vérifié AC-09 (Task 2, comparaison before/after).

**Placeholder scan :** aucun TODO/TBD ; chaque step de code contient le code complet.

**Type consistency :** `mount.react(event): boolean` (Task 4) consommé identiquement par le coordinateur (Task 5) ; `overlay.trigger(event)` (Task 3) idem ; `reactionDuration`/scheduler/loop signatures cohérentes entre Task 3 et ses tests ; `sendEvent(type)` / `onEvent` (Task 6) consommés en Task 8.

**Notes :** AC-01→04 (rendu canvas) et Tasks 7–8 (intégration DOM/live) sont vérifiés visuellement — pas de DOM dans `bun test`, convention du projet (cf. `RainBackground.test.js` qui ne teste que les helpers purs). La logique testable (géométrie, ordonnanceur, boucle, routage, serveur HTTP) est couverte par des tests automatisés.
