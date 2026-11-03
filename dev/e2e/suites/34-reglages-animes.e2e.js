// @ts-check
/**
 * Les réglages d'une couche Code animés par la timeline et par une liaison : le réglage « taille » du code reçoit des images clés (la page isolée en
 * lit les valeurs successives), puis une liaison qui l'emporte, puis retour à la timeline. Les valeurs sont lues **dans la page isolée** : c'est ce que
 * le code voit qui est la preuve, pas l'état du Studio.
 */
import { openStudio } from '../studio.js';

export const name = 'réglages animés';

const JS_FIELD = '#fields textarea[aria-label="JavaScript"]';

/** @param {*} ctx */
export async function run({ page, stack, check }) {
  const probes = () => page.evaluate('window.__probes');
  /** @param {string} probe */
  const last = async (probe) => (await probes()).filter((/** @type {*} */ entry) => entry.probe === probe).at(-1)?.data;
  const countOf = async (/** @type {string} */ probe) => (await probes()).filter((/** @type {*} */ entry) => entry.probe === probe).length;
  /** Attend que la page isolée ait vu la valeur de « taille » (réglage et variable CSS d'accord). @param {number} expected */
  const seen = (expected) => page.waitFor(`(() => { const p = window.__probes.filter((e) => e.probe === 'taille').at(-1); return p !== undefined && p.data.param === ${expected} && p.data.css === ${JSON.stringify(String(expected))}; })()`, 8000);
  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(150);
  };
  const pick = (/** @type {number} */ index, /** @type {string} */ field, /** @type {string} */ value) => page.evaluate(`(() => { const select = document.querySelectorAll('#bindings-list .binding-row')[${index}].querySelector('[data-field=${field}]'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  await openStudio({ page, stack });
  await page.evaluate("window.__probes = []; window.addEventListener('message', (e) => { if (e.data && e.data.probe) window.__probes.push(e.data); });");
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="code"]');
  await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 1", 8000);

  await page.fill(JS_FIELD, `top.postMessage({ probe: 'boot', data: {} }, '*');
const report = () => top.postMessage({ probe: 'taille', data: { param: overlay.params.taille, css: getComputedStyle(document.documentElement).getPropertyValue('--param-taille').trim() } }, '*');
report();
overlay.on('params', report);
`);
  check('la page isolée lit le réglage « taille » à sa valeur par défaut', await seen(120));
  const boots = await countOf('boot');

  // ── Timeline : taille de 20 (0 s) à 400 (2 s) ──
  await page.click('#timeline-toggle');
  const options = await page.evaluate("[...document.querySelectorAll('#timeline-target option')].map((o) => o.value + '=' + o.textContent)");
  check('la liste des valeurs animables propose les six communes, les cinq filtres, puis les réglages bornés du code', options.length === 13 && options.slice(0, 6).join() === 'opacity=Opacité,rotation=Rotation,blur=Flou,scale=Échelle,x=Décalage horizontal,y=Décalage vertical' && options.slice(6, 11).map((o) => o.split('=')[0]).join() === 'filter:brightness,filter:contrast,filter:saturation,filter:hue,filter:glow' && options[11] === 'param:taille=Réglage : Taille (px)' ? true : options);
  await page.selectOption('#timeline-target', 'param:taille');
  await seek(0);
  await page.click('#timeline-add-key');
  check('une première image clé reprend la valeur réglée (120) : rien ne bouge', (await page.evaluate("document.getElementById('timeline-key-value').value")) === '120' && await seen(120));
  check('les bornes de la déclaration s’appliquent à la clé (20 à 400, pas 1)', await page.evaluate("(() => { const v = document.getElementById('timeline-key-value'); return v.min === '20' && v.max === '400' && v.step === '1'; })()"));
  await page.fill('#timeline-key-value', 20);
  check('la régler à 20 est vu par le code', await seen(20));
  await seek(2000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 9999);
  check('une valeur hors bornes (9999 saisis) est ramenée à la borne : le code voit 400', await seen(400));
  const labels = await page.evaluate("[...document.querySelectorAll('.tl-track[data-target=\"param:taille\"] .tl-key')].map((k) => k.getAttribute('aria-label'))");
  check('la piste porte le nom du réglage, et ses clés le disent à un lecteur d’écran', labels.join() === 'Image clé réglage : taille (px) à 0,00 s, valeur 20,Image clé réglage : taille (px) à 2,00 s, valeur 400' ? true : labels);
  check('la piste a son titre lisible', await page.evaluate("document.querySelector('.tl-track[data-target=\"param:taille\"] .tl-label').textContent === 'Réglage : Taille (px)'"));

  await seek(1000);
  check('à mi-parcours, le code voit la valeur interpolée (courbe symétrique : 210)', await seen(210));
  check('le curseur de réglage du formulaire garde la valeur réglée à la main', (await page.evaluate("document.querySelector('#fields .params-field input[type=range]').value")) === '120');
  await seek(0);
  check('au début de la piste, le code voit 20', await seen(20));
  check('la page n’a pas été rechargée pendant l’animation', (await countOf('boot')) === boots);

  // ── Liaison : un réglage se choisit dans la liste de la liaison, et elle l'emporte sur la timeline ──
  await page.click('#bindings-add');
  const targets = await page.evaluate("[...document.querySelectorAll('#bindings-list .binding-row')[0].querySelectorAll('[data-field=target] option')].map((o) => o.value)");
  check('la liaison propose aussi les réglages bornés', targets.join() === 'opacity,rotation,blur,scale,x,y,filter:brightness,filter:contrast,filter:saturation,filter:hue,filter:glow,param:taille,param:duree' ? true : targets);
  await pick(0, 'target', 'param:taille');
  await page.sleep(200);
  const row = await page.evaluate("(() => { const r = document.querySelector('#bindings-list .binding-row'); return { target: r.querySelector('[data-field=target]').value, from: r.querySelector('[data-field=from]').value, to: r.querySelector('[data-field=to]').value }; })()");
  check('elle part de la valeur par défaut du réglage jusqu’à son maximum', row.target === 'param:taille' && row.from === '120' && row.to === '400' ? true : row);
  await seek(1000);
  check('au repos la liaison vaut « de » (120) et l’emporte sur la timeline (qui dirait 210)', await seen(120));
  await page.click('#bindings-list .binding-remove');
  await page.sleep(200);
  await seek(1000);
  check('la liaison retirée, la timeline reprend la main (210)', await seen(210));

  // ── Retirer la piste rend la valeur réglée à la main ──
  await page.evaluate("document.querySelector('.tl-track[data-target=\"param:taille\"] .tl-key').click()");
  await page.click('#timeline-key-remove');
  await page.evaluate("document.querySelector('.tl-track[data-target=\"param:taille\"] .tl-key').click()");
  await page.click('#timeline-key-remove');
  check('sans clé, la piste disparaît', await page.evaluate("document.querySelector('.tl-track[data-target=\"param:taille\"]') === null"));
  check('le code retrouve la valeur réglée à la main (120)', await seen(120));
  const last120 = await last('taille');
  check('la valeur vue par le code est bien un nombre entier de réglage', last120.param === 120);
}
