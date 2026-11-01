import { describe, expect, test } from 'bun:test';
import { CodeLayer, READY_DEADLINE_MS, RELOAD_DELAY_MS, normalizeCodeOptions } from './CodeLayer.js';
import { BRIDGE_VERSION } from './code-document.js';
import { kindDefaults } from './kind-options.js';

const BASE = 'http://localhost:5932';

/** Un DOM minimal : un calque et une iframe dont on lit les attributs, le document chargé et les messages reçus. */
function setup({ width = 960, height = 540, sceneHeight = 540 } = {}) {
  /** @type {any[]} */
  const posted = [];
  const contentWindow = { postMessage: (/** @type {any} */ message, /** @type {string} */ target) => posted.push({ message, target }) };
  const frame = {
    attributes: /** @type {Record<string, string>} */ ({}),
    style: /** @type {Record<string, string>} */ ({}),
    srcdoc: '',
    title: '',
    contentWindow,
    removed: false,
    loadHandlers: /** @type {(() => void)[]} */ ([]),
    setAttribute(/** @type {string} */ name, /** @type {string} */ value) { this.attributes[name] = value; },
    addEventListener(/** @type {string} */ type, /** @type {() => void} */ handler) { if (type === 'load') this.loadHandlers.push(handler); },
    removeEventListener(/** @type {string} */ type, /** @type {() => void} */ handler) { if (type === 'load') this.loadHandlers = this.loadHandlers.filter((entry) => entry !== handler); },
    remove() { this.removed = true; },
  };
  const wrapper = { style: /** @type {Record<string, string>} */ ({}), offsetWidth: width, offsetHeight: height, children: /** @type {any[]} */ ([]), appendChild(/** @type {any} */ child) { this.children.push(child); } };
  /** @type {Record<string, ((event: any) => void)[]>} */
  const handlers = {};
  const view = {
    devicePixelRatio: 2,
    addEventListener: (/** @type {string} */ type, /** @type {*} */ handler) => { (handlers[type] ??= []).push(handler); },
    removeEventListener: (/** @type {string} */ type, /** @type {*} */ handler) => { handlers[type] = (handlers[type] ?? []).filter((entry) => entry !== handler); },
  };
  /** @type {(() => void)[]} */
  let observed = [];
  const documentRef = { createElement: (/** @type {string} */ tag) => (tag === 'iframe' ? frame : wrapper) };
  /** @type {{ callback: () => void, at: number }[]} */
  const timers = [];
  let clock = 0;
  const environment = {
    documentRef: /** @type {any} */ (documentRef),
    view: /** @type {any} */ (view),
    ResizeObserverImpl: /** @type {any} */ (class { constructor(/** @type {() => void} */ callback) { observed.push(callback); } observe() {} disconnect() { observed = []; } }),
    assetBase: BASE,
    sceneHeight: () => sceneHeight,
    setTimer: (/** @type {() => void} */ callback, /** @type {number} */ delay) => { const entry = { callback, at: clock + delay }; timers.push(entry); return entry; },
    clearTimer: (/** @type {*} */ handle) => { const index = timers.indexOf(handle); if (index >= 0) timers.splice(index, 1); },
    now: () => clock,
  };
  return {
    environment,
    frame,
    wrapper,
    posted,
    timers,
    handlers,
    resize: () => { for (const callback of observed) callback(); },
    advance(/** @type {number} */ ms) { clock += ms; for (const timer of timers.filter((entry) => entry.at <= clock)) { timers.splice(timers.indexOf(timer), 1); timer.callback(); } },
    /** Un message venu de l'iframe. */
    fromFrame(/** @type {any} */ data, source = contentWindow) { for (const handler of handlers.message ?? []) handler({ source, data: { overlayCode: BRIDGE_VERSION, ...data } }); },
    sent: () => posted.map((entry) => entry.message),
    /** Le navigateur a fini de charger un document dans l'iframe. */
    loaded: () => { for (const handler of [...frame.loadHandlers]) handler(); },
  };
}

const options = (/** @type {Record<string, unknown>} */ extra = {}) => ({ ...kindDefaults('code'), ...extra });

describe('CodeLayer — isolation', () => {
  test('l’iframe est un bac à sable de scripts seuls : pas de même origine, pas de navigation, pas d’API du navigateur déléguée', () => {
    const t = setup();
    CodeLayer(options(), t.environment);
    expect(t.frame.attributes.sandbox).toBe('allow-scripts');
    expect(t.frame.attributes.allow).toBe('');
    expect(t.frame.attributes.referrerpolicy).toBe('no-referrer');
    expect(t.frame.style.pointerEvents ?? '').toBe('');
    expect(/** @type {any} */ (t.frame).style.cssText).toContain('pointer-events:none');
  });

  test('le document est chargé dans srcdoc (jamais par une adresse) et porte la politique du contenu', () => {
    const t = setup();
    CodeLayer(options({ html: '<b>x</b>' }), t.environment);
    expect(t.frame.srcdoc).toContain('Content-Security-Policy');
    expect(t.frame.srcdoc).toContain('<b>x</b>');
    expect(t.frame.attributes.src).toBeUndefined();
  });

  test('seuls les messages de CETTE iframe sont lus', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'error', message: 'faux' }, /** @type {any} */ ({ autre: true }));
    t.fromFrame({ type: 'error', message: 'faux' }, /** @type {any} */ (null));
    expect(layer.reports?.current()).toEqual([]);
    t.fromFrame({ type: 'error', message: 'vrai', line: 3, column: 1 });
    expect(layer.reports?.current()).toEqual([{ message: 'vrai', line: null, column: null }]);
  });

  test('un message sans la bonne version est ignoré', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    for (const handler of t.handlers.message) handler({ source: t.frame.contentWindow, data: { overlayCode: BRIDGE_VERSION + 1, type: 'error', message: 'x' } });
    expect(layer.reports?.current()).toEqual([]);
  });
});

describe('CodeLayer — échelle de la source de référence', () => {
  test('l’iframe est dimensionnée en pixels de la source de référence puis mise à l’échelle de la source réelle', () => {
    const t = setup({ width: 1920, height: 1080, sceneHeight: 2160 });
    CodeLayer(options(), t.environment);
    // Une source en 4K : la page voit 960×540 pixels de référence… sur un calque de 1920×1080 pixels réels, à l’échelle 2.
    expect(t.frame.style.transform).toBe('scale(2)');
    expect(t.frame.style.width).toBe('960px');
    expect(t.frame.style.height).toBe('540px');
  });

  test('la taille et le ratio de pixels que voit le code sont ceux de l’échelle réelle', () => {
    const t = setup({ width: 1920, height: 1080, sceneHeight: 2160 });
    CodeLayer(options(), t.environment);
    expect(t.frame.srcdoc).toContain('"size":{"width":960,"height":540}');
    // échelle 2 × ratio de l’écran 2
    expect(t.frame.srcdoc).toContain('"pixelRatio":4');
  });

  test('tant que le calque n’a pas de taille, rien n’est chargé', () => {
    const t = setup({ width: 0, height: 0 });
    CodeLayer(options(), t.environment);
    expect(t.frame.srcdoc).toBe('');
    t.wrapper.offsetWidth = 960;
    t.wrapper.offsetHeight = 540;
    t.resize();
    expect(t.frame.srcdoc).toContain('Content-Security-Policy');
  });

  test('un redimensionnement prévient le code (une fois chargé), sans recharger la page', () => {
    const t = setup();
    CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    t.posted.length = 0;
    const before = t.frame.srcdoc;
    t.wrapper.offsetWidth = 480;
    t.resize();
    // Un calque de 480×540 sur une source de 540 de haut : l'échelle est 0,5, la page voit 960×1080 pixels de référence.
    expect(t.sent()).toEqual([{ overlayCode: BRIDGE_VERSION, type: 'resize', size: { width: 960, height: 1080 }, pixelRatio: 1 }]);
    expect(t.frame.srcdoc).toBe(before);
  });
});

describe('CodeLayer — messages vers le code', () => {
  test('avant « ready » rien n’est envoyé ; à « ready », les réglages et le dernier son partent', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    layer.setAudioLevel?.({ level: 0.5, bass: 0.1, mid: 0.2, treble: 0.3 });
    expect(t.posted).toEqual([]);
    t.fromFrame({ type: 'ready' });
    expect(t.sent().map((message) => message.type)).toEqual(['params', 'levels']);
  });

  test('le message part vers « * » : une page à origine opaque ne se vise pas autrement', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    layer.setAudioLevel?.({ level: 1, bass: 0, mid: 0, treble: 0 });
    expect(t.posted.at(-1).target).toBe('*');
  });

  test('une alerte arrivée avant « ready » est remise à son arrivée, dans l’ordre', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    layer.trigger?.({ type: 'follow', username: 'a' });
    layer.trigger?.({ type: 'raid', username: 'b', amount: 5 });
    t.fromFrame({ type: 'ready' });
    const alerts = t.sent().filter((message) => message.type === 'alert').map((message) => message.alert);
    expect(alerts).toEqual([{ type: 'follow', username: 'a', amount: undefined }, { type: 'raid', username: 'b', amount: 5 }]);
  });

  test('une alerte trop ancienne n’est pas remise (la scène a déjà tourné)', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    layer.trigger?.({ type: 'follow' });
    t.advance(10_001);
    layer.trigger?.({ type: 'sub' });
    t.fromFrame({ type: 'ready' });
    expect(t.sent().filter((message) => message.type === 'alert').map((message) => message.alert.type)).toEqual(['sub']);
  });

  test('dix alertes au plus attendent', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    for (let index = 0; index < 25; index += 1) layer.trigger?.({ type: 'follow', username: `u${index}` });
    t.fromFrame({ type: 'ready' });
    const kept = t.sent().filter((message) => message.type === 'alert');
    expect(kept).toHaveLength(10);
    expect(kept[0].alert.username).toBe('u15');
  });

  test('une fois prêt, une alerte part tout de suite, et seuls type, nom et montant sont transmis', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    t.posted.length = 0;
    layer.trigger?.({ type: 'bits', username: 'z', amount: 100, secret: 'jeton' });
    expect(t.sent()).toEqual([{ overlayCode: BRIDGE_VERSION, type: 'alert', alert: { type: 'bits', username: 'z', amount: 100 } }]);
  });
});

describe('CodeLayer — mise à jour', () => {
  test('un réglage modifié part au code, sans recharger la page', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    t.posted.length = 0;
    const before = t.frame.srcdoc;
    layer.update?.(options({ params: { taille: 200 } }));
    expect(t.sent()).toHaveLength(1);
    expect(t.sent()[0]).toMatchObject({ type: 'params', values: { taille: 200 }, variables: { '--param-taille': '200' } });
    expect(t.frame.srcdoc).toBe(before);
  });

  test('un réglage identique n’envoie rien', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    t.posted.length = 0;
    layer.update?.(options());
    expect(t.posted).toEqual([]);
  });

  test('un changement de code recharge la page après une courte pause, une seule fois quelle que soit la frappe', () => {
    const t = setup();
    const layer = CodeLayer(options({ html: '<i>a</i>' }), t.environment);
    const first = t.frame.srcdoc;
    layer.update?.(options({ html: '<i>ab</i>' }));
    t.advance(RELOAD_DELAY_MS - 10);
    layer.update?.(options({ html: '<i>abc</i>' }));
    t.advance(RELOAD_DELAY_MS - 10);
    expect(t.frame.srcdoc).toBe(first);
    t.advance(20);
    expect(t.frame.srcdoc).toContain('<i>abc</i>');
    expect(t.frame.srcdoc).not.toBe(first);
  });

  test('un rechargement efface les erreurs de la page précédente et attend un nouveau « ready »', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'ready' });
    t.fromFrame({ type: 'error', message: 'ancienne' });
    layer.update?.(options({ js: 'let a = 1;' }));
    t.advance(RELOAD_DELAY_MS);
    expect(layer.reports?.current()).toEqual([]);
    t.posted.length = 0;
    layer.setAudioLevel?.({ level: 1, bass: 1, mid: 1, treble: 1 });
    expect(t.posted).toEqual([]);
    t.fromFrame({ type: 'ready' });
    expect(t.sent().map((message) => message.type)).toEqual(['params', 'levels']);
  });

  test('un changement de la déclaration des réglages recharge aussi (les variables retirées ne restent pas)', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    const first = t.frame.srcdoc;
    layer.update?.(options({ paramSpec: '[]' }));
    t.advance(RELOAD_DELAY_MS);
    expect(t.frame.srcdoc).not.toBe(first);
    expect(t.frame.srcdoc).toContain('"variables":{}');
  });

  test('après destroy, un rechargement en attente n’a plus lieu', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    layer.update?.(options({ html: '<i>x</i>' }));
    layer.destroy?.();
    expect(t.timers).toHaveLength(0);
  });
});

describe('CodeLayer — erreurs remontées au Studio', () => {
  test('les erreurs s’accumulent (20 au plus, les plus récentes) et préviennent les abonnés', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    const seen = [];
    const off = layer.reports?.subscribe((reports) => seen.push(reports.length));
    for (let index = 0; index < 25; index += 1) t.fromFrame({ type: 'error', message: `e${index}` });
    expect(layer.reports?.current()).toHaveLength(20);
    expect(layer.reports?.current()[0].message).toBe('e5');
    expect(seen.length).toBe(25);
    off?.();
    t.fromFrame({ type: 'error', message: 'après' });
    expect(seen.length).toBe(25);
  });

  test('un message d’erreur démesuré est tronqué', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.fromFrame({ type: 'error', message: 'x'.repeat(5000) });
    expect(layer.reports?.current()[0].message).toHaveLength(500);
  });
});

describe('CodeLayer — ligne d’une erreur', () => {
  /** La ligne du document où se trouve le marqueur, lue dans le document réellement chargé. */
  const lineOf = (/** @type {string} */ srcdoc, /** @type {string} */ marker) => srcdoc.split('\n').findIndex((line) => line.includes(marker)) + 1;

  test('une erreur du module est rapportée à sa ligne dans le code de l’auteur, pas dans le document', () => {
    const t = setup();
    const layer = CodeLayer(options({ js: 'PREMIERE\nSECONDE\nTROISIEME' }), t.environment);
    const first = lineOf(t.frame.srcdoc, 'PREMIERE');
    t.fromFrame({ type: 'error', message: 'e', line: first + 1, library: false });
    expect(layer.reports?.current()[0].line).toBe(2);
  });

  test('une erreur hors du JavaScript de l’auteur (HTML, CSS, avant ou après) n’a pas de ligne', () => {
    const t = setup();
    const layer = CodeLayer(options({ js: 'A\nB' }), t.environment);
    const first = lineOf(t.frame.srcdoc, '<script type="module">A');
    t.fromFrame({ type: 'error', message: 'avant', line: first - 1 });
    t.fromFrame({ type: 'error', message: 'après', line: first + 2 });
    t.fromFrame({ type: 'error', message: 'sans ligne' });
    expect(layer.reports?.current().map((report) => report.line)).toEqual([null, null, null]);
  });

  test('une erreur d’un fichier de la médiathèque n’a pas de ligne : ce ne sont pas celles du code de l’auteur', () => {
    const t = setup();
    const layer = CodeLayer(options({ js: 'A\nB\nC' }), t.environment);
    const first = lineOf(t.frame.srcdoc, '<script type="module">A');
    t.fromFrame({ type: 'error', message: 'dans three', line: first + 1, library: true });
    expect(layer.reports?.current()[0].line).toBeNull();
  });

  test('après un rechargement, la ligne se calcule sur le nouveau document', () => {
    const t = setup();
    const layer = CodeLayer(options({ html: 'x', js: 'A\nB' }), t.environment);
    layer.update?.(options({ html: 'x\ny\nz', js: 'A\nB' }));
    t.advance(RELOAD_DELAY_MS);
    const first = lineOf(t.frame.srcdoc, '<script type="module">A');
    t.fromFrame({ type: 'error', message: 'e', line: first + 1 });
    expect(layer.reports?.current()[0].line).toBe(2);
  });
});

describe('CodeLayer — navigation de la page', () => {
  test('le chargement que l’hôte a demandé est normal ; un chargement de plus est une navigation : la page est vidée et l’auteur prévenu', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.loaded();
    expect(layer.reports?.current()).toEqual([]);
    expect(t.frame.srcdoc).toContain('Content-Security-Policy');
    t.fromFrame({ type: 'ready' });
    t.loaded();
    expect(t.frame.srcdoc).toBe('');
    expect(layer.reports?.current().map((report) => report.message)).toEqual(['La page a tenté de quitter son document (navigation) : elle a été arrêtée.']);
  });

  test('vider la page ne se prend pas lui-même pour une navigation, et rien n’est envoyé à une page arrêtée', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.loaded();
    t.fromFrame({ type: 'ready' });
    t.loaded();
    t.loaded();
    expect(layer.reports?.current()).toHaveLength(1);
    t.posted.length = 0;
    layer.setAudioLevel?.({ level: 1, bass: 1, mid: 1, treble: 1 });
    layer.trigger?.({ type: 'raid' });
    expect(t.posted).toEqual([]);
  });

  test('modifier le code recharge une page neuve, qui n’est plus arrêtée', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.loaded();
    t.loaded();
    t.loaded();
    layer.update?.(options({ html: '<b>autre</b>' }));
    t.advance(RELOAD_DELAY_MS);
    expect(t.frame.srcdoc).toContain('<b>autre</b>');
    t.loaded();
    expect(layer.reports?.current()).toEqual([]);
    t.fromFrame({ type: 'ready' });
    expect(t.sent().map((message) => message.type)).toContain('params');
  });

  test('plusieurs rechargements demandés sont autant de chargements normaux', () => {
    const t = setup();
    const layer = CodeLayer(options({ js: 'a' }), t.environment);
    t.loaded();
    for (const js of ['b', 'c', 'd']) {
      layer.update?.(options({ js }));
      t.advance(RELOAD_DELAY_MS);
      t.loaded();
    }
    expect(layer.reports?.current()).toEqual([]);
    expect(t.frame.srcdoc).toContain('>d<');
  });

  test('une redirection lancée avant la fin du chargement : le document étranger prend la place attendu, sans « ready » il est arrêté', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.loaded();
    t.advance(READY_DEADLINE_MS - 1);
    expect(t.frame.srcdoc).toContain('Content-Security-Policy');
    expect(layer.reports?.current()).toEqual([]);
    t.advance(1);
    expect(t.frame.srcdoc).toBe('');
    expect(layer.reports?.current().map((report) => report.message)).toEqual(['La page a tenté de quitter son document (navigation) : elle a été arrêtée.']);
  });

  test('une page qui s’annonce à temps n’est pas arrêtée, même si elle met longtemps à charger', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.advance(30_000);
    t.loaded();
    t.advance(READY_DEADLINE_MS - 100);
    t.fromFrame({ type: 'ready' });
    t.advance(60_000);
    expect(t.frame.srcdoc).toContain('Content-Security-Policy');
    expect(layer.reports?.current()).toEqual([]);
  });

  test('l’arrêt vide la page une seule fois, même si le délai et un chargement de trop se suivent', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    t.loaded();
    t.loaded();
    t.advance(READY_DEADLINE_MS);
    t.loaded();
    expect(layer.reports?.current()).toHaveLength(1);
  });

  test('un rechargement demandé remet le délai à zéro', () => {
    const t = setup();
    const layer = CodeLayer(options({ js: 'a' }), t.environment);
    t.loaded();
    t.advance(READY_DEADLINE_MS - 10);
    layer.update?.(options({ js: 'b' }));
    t.advance(RELOAD_DELAY_MS);
    expect(t.frame.srcdoc).toContain('>b<');
    t.advance(READY_DEADLINE_MS);
    expect(t.frame.srcdoc).toContain('>b<');
    expect(layer.reports?.current()).toEqual([]);
  });

  test('après destroy, un chargement tardif est ignoré', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    layer.destroy?.();
    expect(t.frame.loadHandlers).toHaveLength(0);
  });
});

describe('CodeLayer — cycle de vie', () => {
  test('destroy retire l’iframe, vide son document et cesse d’écouter la fenêtre', () => {
    const t = setup();
    const layer = CodeLayer(options(), t.environment);
    expect(t.handlers.message).toHaveLength(1);
    layer.destroy?.();
    expect(t.frame.removed).toBe(true);
    expect(t.frame.srcdoc).toBe('');
    expect(t.handlers.message).toHaveLength(0);
  });
});

describe('normalizeCodeOptions', () => {
  test('des options partielles ou invalides donnent les défauts, une déclaration invalide ne casse rien', () => {
    const result = normalizeCodeOptions({ html: 12, paramSpec: '{pas du json' });
    expect(result.html).toBe(kindDefaults('code').html);
    expect(result.params).toEqual([]);
    expect(result.specErrors[0]).toContain('JSON invalide');
    expect(result.values).toEqual({});
  });

  test('les valeurs sont complétées par les défauts de la déclaration', () => {
    expect(normalizeCodeOptions({}).values).toEqual({ couleur: '#C8B97A', taille: 120, duree: 3 });
  });
});
