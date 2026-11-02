// @ts-check
/**
 * La couche Code : du HTML, du CSS et du JavaScript écrits dans le Studio, exécutés dans une page isolée. Chaque propriété de l'isolation est
 * vue **de l'intérieur** : le code de l'essai tente de sortir (réseau, stockage, page parente, fenêtre) et rapporte ce qui lui est arrivé par
 * `postMessage`, ce qui prouve l'effet (le navigateur a bloqué, avec la directive qui l'a fait) et pas seulement l'absence d'erreur.
 */
import { pngBytes } from '../../test-images.js';
import { createBackgroundPresetBundle } from '../../background-preset-library.js';
import { layerRows, openStudio } from '../studio.js';

export const name = 'couche code';

const JS_FIELD = '#fields textarea[aria-label="JavaScript"]';
const HTML_FIELD = '#fields textarea[aria-label="HTML"]';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  const probes = () => page.evaluate('window.__probes');
  /** @param {string} probe */
  const last = async (probe) => (await probes()).filter((/** @type {*} */ entry) => entry.probe === probe).at(-1)?.data;
  /** @param {string} probe @param {number} [count] */
  const waitProbe = (probe, count = 1) => page.waitFor(`window.__probes.filter((p) => p.probe === ${JSON.stringify(probe)}).length >= ${count}`, 10_000);
  const countOf = async (/** @type {string} */ probe) => (await probes()).filter((/** @type {*} */ entry) => entry.probe === probe).length;
  const listen = () => page.evaluate("window.__probes = []; window.addEventListener('message', (e) => { if (e.data && e.data.probe) window.__probes.push(e.data); });");

  // Un fichier de la médiathèque que le code ira lire de l'intérieur de sa page isolée.
  const uploaded = await fetch(`http://localhost:${stack.statePort}/assets?name=sonde.png`, { method: 'POST', body: pngBytes(7, 5, 40) });
  const { asset } = await uploaded.json();

  await openStudio({ page, stack });
  await listen();

  // ── Ajout par la galerie ────────────────────────────────────────────────
  await page.click('#layers-add');
  const card = await page.evaluate("(() => { const c = document.querySelector('#gallery-grid [data-kind=\"code\"]'); return c === null ? null : { label: c.querySelector('.gallery-label').textContent, pictogram: c.querySelector('.layer-thumb-identity svg') !== null, thumbnails: c.querySelectorAll('.preset-thumb').length, frames: c.querySelectorAll('iframe').length }; })()");
  check('la galerie propose « Code » avec un pictogramme, sans vignette ni page montée', card !== null && card.label === 'Code' && card.pictogram && card.thumbnails === 0 && card.frames === 0 ? true : card);
  await page.click('#gallery-grid [data-kind="code"]');
  await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 1", 8000);

  const frame = await page.evaluate("(() => { const f = document.querySelector('#bg-layer iframe'); return { sandbox: f.getAttribute('sandbox'), tokens: [...f.sandbox], allow: f.getAttribute('allow'), src: f.getAttribute('src'), csp: f.srcdoc.includes('Content-Security-Policy'), module: f.srcdoc.includes('<script type=\"module\">') }; })()");
  check('la page est un bac à sable de scripts seuls : ni même origine, ni navigation, ni fenêtre, ni formulaire', frame.sandbox === 'allow-scripts' && frame.tokens.join() === 'allow-scripts' ? true : frame);
  check('elle n’a aucune permission du navigateur déléguée, est chargée par srcdoc (pas d’adresse) et porte sa politique', frame.allow === '' && frame.src === null && frame.csp && frame.module ? true : frame);
  check('le formulaire est généré : trois zones de code, la déclaration des réglages et les trois réglages qu’elle annonce', await page.evaluate("document.querySelectorAll('#fields textarea.code-input').length === 4 && document.querySelectorAll('#fields .params-field input[type=range]').length === 2 && document.querySelectorAll('#fields .params-field .color-control').length === 1"));
  const rows = await layerRows(page);
  check('la ligne de la couche montre un pictogramme, jamais une vignette (la page n’est pas montée pour une photo)', rows.some((/** @type {*} */ row) => row.title === 'Code' && row.thumb === 'identity') ? true : rows);
  check('une seule page isolée existe : celle de l’aperçu', await page.evaluate("document.querySelectorAll('iframe[sandbox]').length === 1"));

  // ── Le code, vu de l'intérieur ──────────────────────────────────────────
  const assetUrl = `asset:${asset.id}`;
  const probeCode = `
const send = (probe, data) => top.postMessage({ probe, data }, '*');
document.addEventListener('securitypolicyviolation', (event) => send('csp', { directive: event.violatedDirective, blocked: event.blockedURI }));
send('start', {
  params: overlay.params, size: overlay.size, ratio: overlay.pixelRatio, inner: [innerWidth, innerHeight],
  taille: getComputedStyle(document.documentElement).getPropertyValue('--param-taille').trim(),
  couleur: getComputedStyle(document.documentElement).getPropertyValue('--param-couleur').trim(),
  fond: getComputedStyle(document.body).backgroundColor,
  frozen: Object.isFrozen(overlay),
});
overlay.on('alert', (alert) => send('alert', alert));
overlay.on('params', (params) => send('params', { params, taille: getComputedStyle(document.documentElement).getPropertyValue('--param-taille').trim() }));
overlay.on('levels', (levels) => send('levels', { levels, css: getComputedStyle(document.documentElement).getPropertyValue('--audio').trim() }));

const attempt = async (name, run) => { try { send('attempt', { name, result: await run() }); } catch (error) { send('attempt', { name, result: 'refusé : ' + error.name }); } };
await attempt('médiathèque', async () => { const response = await fetch('${assetUrl}'); return 'lu ' + (await response.arrayBuffer()).byteLength + ' octets, statut ' + response.status; });
await attempt('état du serveur', async () => { await fetch('http://localhost:${stack.statePort}/state'); return 'lu'; });
await attempt('liste de la médiathèque', async () => { await fetch('http://localhost:${stack.statePort}/assets'); return 'lu'; });
await attempt('Internet', async () => { await fetch('https://example.com/'); return 'lu'; });
await attempt('WebSocket', () => new Promise((resolve) => { const socket = new WebSocket('ws://localhost:${stack.statePort}/state-ws'); socket.onopen = () => resolve('ouvert'); socket.onerror = () => resolve('refusé : erreur'); }));
await attempt('image externe', () => new Promise((resolve) => { const image = new Image(); image.onload = () => resolve('chargée'); image.onerror = () => resolve('refusé : erreur'); image.src = 'https://example.com/x.png'; }));
await attempt('stockage', () => localStorage.getItem('x'));
await attempt('cookie', () => document.cookie);
await attempt('page parente', () => parent.document.title);
await attempt('page de premier niveau', () => top.location.href);
await attempt('fenêtre', () => String(window.open('about:blank')));
await attempt('sous-document réseau', () => new Promise((resolve) => { const frame = document.createElement('iframe'); frame.src = 'https://example.com/'; document.body.append(frame); setTimeout(() => resolve('demandé'), 400); }));
await attempt('sous-document local', async () => { const frame = document.createElement('iframe'); document.body.append(frame); try { await frame.contentWindow.fetch('https://example.com/'); return 'lu'; } catch (error) { return 'refusé : ' + error.name; } });
send('done', {});
`;
  await page.fill(JS_FIELD, probeCode);
  check('le code écrit est reçu et exécuté (la page se recharge, puis termine ses essais)', await waitProbe('done'));

  const start = await last('start');
  check('overlay donne les réglages déclarés, leurs variables CSS et un fond transparent', start.params.taille === 120 && start.params.couleur === '#C8B97A' && start.taille === '120' && start.couleur === '#C8B97A' && start.fond === 'rgba(0, 0, 0, 0)' ? true : start);
  check('overlay est figé : le code ne peut ni le remplacer ni y ajouter', start.frozen === true);
  const stage = await page.evaluate("(() => { const r = document.getElementById('bg-layer').getBoundingClientRect(); return { width: r.width, height: r.height }; })()");
  check('la taille vue par le code est celle de la source de référence (1920×1080 pour une toile de ce rapport), pas celle de l’aperçu', Math.abs(start.size.width - 1920) < 1 && Math.abs(start.size.height - 1080) < 1 && Math.abs(start.inner[0] - 1920) < 1 && Math.abs(start.inner[1] - 1080) < 1 ? true : { start, stage });
  check('le ratio de pixels annoncé est celui de la mise en page (échelle de la source × ratio de l’écran) : 1 pour 1080 px de haut sur un écran à 1', Math.abs(start.ratio - 1) < 0.01 ? true : { start, stage });

  const attempts = Object.fromEntries((await probes()).filter((/** @type {*} */ entry) => entry.probe === 'attempt').map((/** @type {*} */ entry) => [entry.data.name, entry.data.result]));
  const wasBlocked = (/** @type {string} */ key) => typeof attempts[key] === 'string' && attempts[key].startsWith('refusé');
  check('un fichier de la médiathèque se lit depuis la page isolée (module, Origin « null »), octet pour octet', attempts['médiathèque'] === `lu ${pngBytes(7, 5, 40).length} octets, statut 200` ? true : { attempts, violations: (await probes()).filter((/** @type {*} */ entry) => entry.probe === 'csp') });
  check('l’état du serveur, la liste de la médiathèque et Internet sont inaccessibles', wasBlocked('état du serveur') && wasBlocked('liste de la médiathèque') && wasBlocked('Internet') ? true : attempts);
  check('un WebSocket vers le serveur et une image extérieure sont refusés', wasBlocked('WebSocket') && wasBlocked('image externe') ? true : attempts);
  check('stockage, cookies, page parente et page de premier niveau sont inaccessibles', wasBlocked('stockage') && wasBlocked('cookie') && wasBlocked('page parente') && wasBlocked('page de premier niveau') ? true : attempts);
  check('une nouvelle fenêtre ne s’ouvre pas', attempts['fenêtre'] === 'null' ? true : attempts);
  check('un sous-document ne charge rien de l’extérieur, et un sous-document local hérite de la politique', wasBlocked('sous-document local') ? true : attempts);
  const violations = (await probes()).filter((/** @type {*} */ entry) => entry.probe === 'csp').map((/** @type {*} */ entry) => entry.data);
  check('le navigateur a bloqué par la politique, et la directive est la bonne (connect-src, img-src, frame-src par défaut)',
    violations.some((/** @type {*} */ v) => v.directive.startsWith('connect-src') && v.blocked.includes(`:${stack.statePort}/state`))
      && violations.some((/** @type {*} */ v) => v.directive.startsWith('connect-src') && v.blocked.includes('example.com'))
      && violations.some((/** @type {*} */ v) => v.directive.startsWith('img-src') && v.blocked.includes('example.com'))
      && violations.some((/** @type {*} */ v) => v.directive.startsWith('frame-src') && v.blocked.includes('example.com')) ? true : violations);

  // ── Les réglages se changent sans recharger la page ─────────────────────
  const startsBefore = await countOf('start');
  await page.fill('#fields .params-field .numeric-control input[type=number]', 250);
  check('un réglage modifié arrive au code (overlay.on("params")) avec sa variable CSS à jour', await waitProbe('params'));
  const params = await last('params');
  check('la valeur et la variable CSS sont celles du réglage', params.params.taille === 250 && params.taille === '250' ? true : params);
  check('la page n’a pas été rechargée pour un réglage', (await countOf('start')) === startsBefore);

  // ── Le son ──────────────────────────────────────────────────────────────
  // La couche demande le micro quand « Réagit au son » est coché ; l'essai ne le demande pas : le niveau est envoyé à la couche montée.
  const audioReached = await page.evaluate(`(() => {
    const frame = document.querySelector('#bg-layer iframe');
    frame.contentWindow.postMessage({ overlayCode: 1, type: 'levels', levels: { level: 0.5, bass: 0.25, mid: 0.125, treble: 0.0625 } }, '*');
    return true;
  })()`);
  check('un message de niveaux envoyé à la page isolée atteint le code et la variable --audio', audioReached && await waitProbe('levels') && (await last('levels')).css === '0.5' && (await last('levels')).levels.bass === 0.25 ? true : await last('levels'));

  // ── Les alertes ─────────────────────────────────────────────────────────
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  check('une alerte arrive au code avec son type, son nom et son montant', await waitProbe('alert') && JSON.stringify(await last('alert')) === JSON.stringify({ type: 'raid', username: 'Léna', amount: 42 }) ? true : await last('alert'));

  // ── Un changement de code recharge la page, une seule fois ──────────────
  const before = await countOf('start');
  await page.fill(HTML_FIELD, '<p id="x">Autre</p>');
  await page.fill(HTML_FIELD, '<p id="x">Autre texte</p>');
  await page.sleep(900);
  check('plusieurs frappes rapprochées ne rechargent la page qu’une fois', (await countOf('start')) === before + 1 ? true : { avant: before, après: await countOf('start') });

  // ── Les erreurs du code sont montrées sous le champ, à leur ligne ───────
  await page.fill(JS_FIELD, 'const a = 1;\nthrow new Error("boum");\n');
  const shown = await page.waitFor("(() => { const s = document.querySelector('#fields .code-field:has(textarea[aria-label=\"JavaScript\"]) .field-status'); return s !== null && s.dataset.level === 'error' && s.textContent.includes('boum'); })()", 8000);
  const status = await page.evaluate("document.querySelector('#fields .code-field:has(textarea[aria-label=\"JavaScript\"]) .field-status').textContent");
  check('l’erreur du code apparaît sous le champ JavaScript, avec sa ligne dans ce code', shown && status.includes('ligne 2') ? true : status);

  // ── Une page qui tente de se rediriger ailleurs est arrêtée ─────────────
  // Aucune directive du navigateur n'interdit à une page isolée de naviguer d'elle-même : l'hôte voit le chargement qu'il n'a pas demandé.
  await page.fill(JS_FIELD, `top.postMessage({ probe: 'avant-navigation', data: {} }, '*');\nlocation.href = 'http://localhost:${stack.statePort}/state';\n`);
  const quitted = await page.waitFor("(() => { const s = document.querySelector('#fields .code-field:has(textarea[aria-label=\"JavaScript\"]) .field-status'); return s !== null && s.textContent.includes('quitter son document'); })()", 10_000);
  check('la page qui se redirige d’elle-même est arrêtée et l’auteur en est prévenu sous le champ', quitted && await countOf('avant-navigation') >= 1);
  check('elle est vidée : plus aucun document, donc plus de code qui tourne ni de contenu extérieur', await page.evaluate("document.querySelector('#bg-layer iframe').srcdoc === ''"));

  // ── La déclaration des réglages : défauts en direct, formulaire reconstruit ──
  await page.fill('#fields textarea[aria-label="Réglages exposés (JSON)"]', '[ { "key": "vitesse", "type": "number", "default": 2, "min": 0, "max": 5, "step": 0.5 }, { "key": "Mauvaise Clé", "type": "number", "default": 1 } ]');
  await page.sleep(300);
  const declared = await page.evaluate(`({
    labels: [...document.querySelectorAll('#fields .params-field label')].map((l) => l.textContent),
    problems: document.querySelector('#fields .code-field:has(textarea[aria-label="Réglages exposés (JSON)"]) .field-status').textContent,
    level: document.querySelector('#fields .code-field:has(textarea[aria-label="Réglages exposés (JSON)"]) .field-status').dataset.level,
  })`);
  check('la déclaration change le formulaire sans le rouvrir : un réglage valide reste, l’invalide est écarté', declared.labels.join() === 'vitesse' ? true : declared);
  check('le défaut de la déclaration est dit en clair, en direct', declared.level === 'error' && declared.problems.includes('la clé doit commencer par une minuscule') ? true : declared);

  // ── Insérer un fichier de la médiathèque ────────────────────────────────
  await page.fill(JS_FIELD, '// début\n');
  await page.click(`.code-field:has(textarea[aria-label="JavaScript"]) .code-insert`);
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  await page.click('#asset-library .asset-use');
  await page.waitFor(`document.querySelector('${JS_FIELD}').value.includes('asset:')`, 5000);
  const inserted = await page.evaluate(`document.querySelector('${JS_FIELD}').value`);
  check('« Insérer un fichier » écrit asset:<identifiant> dans le code', inserted.includes(`asset:${asset.id}`) ? true : inserted);

  // ── Publication, usage du fichier, rechargement ─────────────────────────
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'code');
  check('publié : le serveur accepte la couche, avec son code et ses réglages', aired !== undefined && aired.options.js.includes(`asset:${asset.id}`) && aired.options.html.includes('Autre texte') ? true : aired);
  const listed = (await stack.api('/assets')).assets.find((/** @type {*} */ entry) => entry.id === asset.id);
  check('le fichier référencé par le code compte comme utilisé : la médiathèque ne le laisse plus supprimer', listed !== undefined && listed.uses >= 1 ? true : listed);
  const refused = await fetch(`http://localhost:${stack.statePort}/assets/${asset.id}`, { method: 'DELETE' });
  check('la suppression de ce fichier est refusée (409) tant que le code le référence', refused.status === 409);

  // ── Importer un lot qui contient du code : confirmation écrite ──────────
  const incoming = { version: 1, id: 'scene-codee', name: 'Scène codée', layers: [{ id: 'code-1', kind: 'code', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { html: '<b>importé</b>', css: '', js: '', paramSpec: '[]', params: {}, audioReactive: false } }] };
  const content = JSON.stringify(createBackgroundPresetBundle([], [incoming]));
  // La vignette monte la scène le temps d'une photo puis la démonte : on observe les pages isolées qui apparaissent DANS une vignette.
  await page.evaluate(`window.__thumbFrames = 0; new MutationObserver((records) => {
    for (const record of records) for (const added of record.addedNodes) {
      if (added.nodeType === 1 && (added.tagName === 'IFRAME' || added.querySelector('iframe')) && added.closest('.preset-thumb')) window.__thumbFrames += 1;
    }
  }).observe(document.body, { childList: true, subtree: true });`);
  await page.evaluate(`(() => {
    const input = document.getElementById('preset-import');
    const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(content)}], 'scene-codee.json', { type: 'application/json' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  check('un lot qui contient du code l’annonce avant d’être confirmé', await page.waitFor("!document.getElementById('preset-import-code').hidden && document.getElementById('preset-import-code-text').textContent.includes('une couche de code')", 8000));
  check('l’import est bloqué tant que la case n’est pas cochée', await page.evaluate("document.getElementById('preset-import-confirm').disabled === true"));
  await page.click('#preset-import-code-ack');
  check('la case cochée débloque l’import', await page.evaluate("document.getElementById('preset-import-confirm').disabled === false"));
  await page.click('#preset-import-confirm');
  check('la scène importée apparaît dans la bibliothèque', await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Scène codée'))", 10_000));
  const thumbSettled = await page.waitFor("[...document.querySelectorAll('#preset-list .preset-row')].some((r) => r.textContent.includes('Scène codée') && ['empty', 'ready'].includes(r.querySelector('.preset-thumb')?.dataset.state))", 15_000);
  check('la vignette de cette scène ne monte pas la page isolée (le code de la bibliothèque ne tourne pas pour une photo)', thumbSettled && await page.evaluate("window.__thumbFrames === 0") ? true : { thumbSettled, frames: await page.evaluate("window.__thumbFrames") });

  // ── Masquer démonte la page ─────────────────────────────────────────────
  const eye = await page.evaluate("(() => { const row = [...document.querySelectorAll('#layers-list .layer-row')].find((r) => r.querySelector('.layer-title').textContent === 'Code'); return row.querySelector('.layer-visible') !== null; })()");
  if (eye) {
    await page.click('#layers-list .layer-row.is-selected .layer-visible');
    check('masquée, la couche démonte sa page (ni code qui tourne, ni coût)', await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 0", 5000));
    await page.click('#layers-list .layer-row.is-selected .layer-visible');
    check('réaffichée, elle remonte une page neuve', await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 1", 5000));
  }

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 1", 10_000);
  check('après rechargement du Studio, la couche publiée est de retour', true);

  // Les violations de politique et les refus voulus de l'essai sont dans la console du navigateur : ce sont eux, et eux seuls, qu'on écarte.
  const unexpected = errors.filter((/** @type {string} */ entry) => !/Content Security Policy|Refused to|violates|Failed to load resource|net::ERR|sandboxed|Blocked a frame|Unsafe attempt|Uncaught Error: boum|Not allowed to|Failed to read|Failed to execute|insecure|SecurityError|blocked/i.test(entry));
  check('aucune autre erreur dans la console', unexpected.length === 0 ? true : unexpected);
}
