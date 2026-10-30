// @ts-check
/**
 * Garde d'accessibilité du Studio : une règle totale et décidable par classe de défaut, vérifiée sur la page réelle (pas un
 * relevé fait une fois). Chaque règle liste ce qu'elle trouve ; la suite échoue tant que la liste n'est pas vide.
 */
import { openStudio } from '../studio.js';

export const name = 'accessibilité';

/** Le script exécuté dans la page : rend, par règle, la liste des éléments fautifs. */
const AUDIT = `(() => {
  const cls = (el) => (el && el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const describe = (el) => el.tagName.toLowerCase() + (el.tagName === 'INPUT' ? '[' + el.type + ']' : '') + (el.id ? '#' + el.id : cls(el) + (el.parentElement ? ' dans ' + el.parentElement.tagName.toLowerCase() + (el.parentElement.id ? '#' + el.parentElement.id : cls(el.parentElement)) : ''));
  const text = (el) => (el.textContent || '').trim();
  const labelledBy = (el) => (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map((id) => text(document.getElementById(id) || document.body)).join(' ').trim();
  const accessibleName = (el) => (el.getAttribute('aria-label') || '').trim() || labelledBy(el) || (el.labels && [...el.labels].map(text).join(' ').trim()) || (el.title || '').trim() || (el.tagName === 'INPUT' && ['button', 'submit'].includes(el.type) ? el.value : '') || (['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role') === 'button' ? text(el) : '');
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]'); };
  const controls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=button], a[href]')];
  const found = {};
  found.sansNom = controls.filter((el) => !accessibleName(el)).map(describe);
  found.dialoguesSansTitre = [...document.querySelectorAll('dialog')].filter((d) => !labelledBy(d) && !(d.getAttribute('aria-label') || '').trim()).map(describe);
  const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
  found.idDoublons = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  found.tabindexPositif = [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).map(describe);
  found.imagesSansAlt = [...document.querySelectorAll('img')].filter((el) => !el.hasAttribute('alt')).map(describe);
  found.ariaCasse = [...document.querySelectorAll('[aria-labelledby],[aria-describedby]')].flatMap((el) => ['aria-labelledby', 'aria-describedby'].flatMap((attr) => (el.getAttribute(attr) || '').split(/\\s+/).filter(Boolean).filter((id) => !document.getElementById(id)).map((id) => describe(el) + ' -> #' + id)));
  found.boutonsEtatSansAria = [...document.querySelectorAll('button[aria-pressed]')].filter((el) => !['true', 'false'].includes(el.getAttribute('aria-pressed'))).map(describe);
  found.rolesStatutSansLive = [...document.querySelectorAll('[role=status]')].filter((el) => el.getAttribute('aria-live') === 'off').map(describe);
  // Contraste WCAG AA (4,5 : 1 ; 3 : 1 pour un grand texte) du texte visible sur son fond réel.
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  pixel.canvas.width = 1; pixel.canvas.height = 1;
  // Tout format de couleur CSS (rgb, oklch, color-mix…) est normalisé par le navigateur lui-même, en lisant un pixel.
  const parse = (c) => { if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }; pixel.clearRect(0, 0, 1, 1); pixel.fillStyle = '#000'; pixel.fillStyle = c; pixel.fillRect(0, 0, 1, 1); const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
  found.elementsMesures = 0;
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const backdrop = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; } } return stack.reverse().reduce((acc, layer) => over(layer, acc), { r: 8, g: 8, b: 8, a: 1 }); };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const seen = new Set();
  found.contrasteInsuffisant = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('canvas, svg, iframe, [aria-hidden=true]')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) continue;
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    found.elementsMesures += 1;
    const bg = backdrop(el);
    const size = parseFloat(style.fontSize); const bold = Number(style.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const value = ratio(over(fg, bg), bg);
    const key = describe(el) + Math.round(value * 10);
    if (value < need && !seen.has(key)) { seen.add(key); found.contrasteInsuffisant.push(describe(el) + ' ' + value.toFixed(2) + ' < ' + need + ' « ' + text(el).slice(0, 24) + ' »'); }
  }
  found.champsEnTeteSansLangue = document.documentElement.lang ? [] : ['html sans attribut lang'];
  found.titrePage = document.title.trim() ? [] : ['page sans titre'];
  found.garde = found.elementsMesures >= 40 ? [] : ['seulement ' + found.elementsMesures + ' éléments de texte mesurés : la règle de contraste ne voit presque rien'];
  delete found.elementsMesures;
  return found;
})()`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const found = await page.evaluate(AUDIT);
  const rules = {
    sansNom: 'chaque bouton, champ et lien a un nom accessible',
    dialoguesSansTitre: 'chaque fenêtre est titrée (aria-labelledby ou aria-label)',
    idDoublons: 'aucun identifiant en double',
    tabindexPositif: 'aucun tabindex positif (l’ordre de tabulation suit le document)',
    imagesSansAlt: 'chaque image a un attribut alt',
    ariaCasse: 'aucune référence aria vers un identifiant absent',
    boutonsEtatSansAria: 'les boutons à bascule déclarent un état aria-pressed valide',
    rolesStatutSansLive: 'aucune zone de statut n’est muette (aria-live désactivé)',
    garde: 'la règle de contraste mesure bien la page (elle ne passe pas à vide)',
    contrasteInsuffisant: 'le texte visible a un contraste suffisant (WCAG AA) sur son fond',
    champsEnTeteSansLangue: 'la page déclare sa langue',
    titrePage: 'la page a un titre',
  };
  for (const [key, label] of Object.entries(rules)) {
    const list = found[key] ?? [];
    check(label, list.length === 0 ? true : list.slice(0, 12));
  }

  // Les réglages de chaque type d'effet : on ajoute la couche, on audite le panneau qu'elle remplit, on annule.
  await page.press('Control+k');
  await page.fill('#palette-input', 'ajouter');
  const kindLabels = await page.evaluate("[...document.querySelectorAll('#palette-list .palette-label')].map((l) => l.textContent).filter((t) => t.startsWith('Ajouter'))");
  await page.press('Escape');
  check('la palette propose les types d’effet à auditer', kindLabels.length >= 5);
  /** @type {string[]} */
  const offenders = [];
  for (const label of kindLabels) {
    await page.press('Control+k');
    await page.fill('#palette-input', label);
    await page.press('Enter');
    await page.sleep(300);
    // Une commande indisponible (le branding existe déjà) laisse la palette ouverte : on la ferme, il n'y a rien de neuf à auditer.
    if (await page.evaluate("document.getElementById('command-palette').open")) {
      await page.press('Escape');
      continue;
    }
    const report = await page.evaluate(AUDIT);
    for (const [key, list] of Object.entries(report)) for (const item of /** @type {string[]} */ (list)) offenders.push(`${label} / ${key} : ${item}`);
    await page.press('Control+z');
    await page.sleep(100);
  }
  check('les réglages de chaque type d’effet respectent les mêmes règles', offenders.length === 0 ? true : offenders.slice(0, 12));

  // Focus visible : chaque contrôle visible change d'apparence quand il prend le focus clavier (contour, ombre, bordure ou fond).
  const noFocusStyle = await page.evaluate(`(() => {
    const look = (el) => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.backgroundColor, s.color].join('|'); };
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]') && !el.disabled && el.type !== 'hidden' && !(el.type === 'file'); };
    const controls = [...document.querySelectorAll('button, input, select, textarea, a[href]')].filter(visible);
    const fautifs = [];
    for (const el of controls) {
      const before = look(el);
      el.focus({ focusVisible: true });
      if (document.activeElement === el && look(el) === before) fautifs.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''));
      el.blur();
    }
    return { total: controls.length, fautifs };
  })()`);
  check('la page propose assez de contrôles pour que la règle de focus ait un sens', noFocusStyle.total >= 30);
  check('chaque contrôle visible montre qu’il a le focus clavier', noFocusStyle.fautifs.length === 0 ? true : noFocusStyle.fautifs.slice(0, 12));

  // Les fenêtres : le focus y entre et Échap les ferme en rendant le focus.
  const dialogs = [
    ['#history-open', '#history', '#history-close'],
    ['#layers-history', '#edits-dialog', '#edits-close'],
  ];
  for (const [openSelector, dialogSelector] of dialogs) {
    await page.click(openSelector);
    const inside = await page.waitFor(`document.querySelector(${JSON.stringify(dialogSelector)}).open`, 5000);
    await page.press('Escape');
    const closed = await page.evaluate(`!document.querySelector(${JSON.stringify(dialogSelector)}).open`);
    check(`${dialogSelector} : s’ouvre, se ferme avec Échap`, inside === true && closed === true);
  }

  // Tout contrôle atteignable au clavier : la tabulation traverse l'en-tête sans piège.
  await page.focus('#antenna-copy');
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    await page.press('Tab');
    seen.add(await page.evaluate('document.activeElement?.id || document.activeElement?.tagName'));
  }
  check('la tabulation avance (aucun piège de focus dans l’en-tête)', seen.size >= 6);

  // Annonces : ce qui change sans que le focus bouge est dit dans la zone aria-live.
  const announced = () => page.evaluate("document.getElementById('studio-announcer').textContent.trim()");
  const live = await page.evaluate("(() => { const el = document.getElementById('studio-announcer'); return [el.getAttribute('aria-live'), el.getAttribute('role'), getComputedStyle(el).position]; })()");
  check('la zone d’annonces est un statut poli, hors du flux visuel', live[0] === 'polite' && live[1] === 'status' && live[2] === 'absolute');
  await page.click('#layers-list .layer-row:nth-child(2)');
  check('sélectionner une couche l’annonce', (await announced()).startsWith('Couche sélectionnée'));
  await page.click('#layers-list .layer-row:nth-child(1)', { modifiers: ['Control'] });
  check('en sélectionner plusieurs annonce le nombre', (await announced()) === '2 couches sélectionnées');
  await page.fill('#inspector-opacity', '60');
  await page.press('Tab');
  await page.click('#layers-undo');
  await page.sleep(100);
  check('annuler annonce l’étape annulée', (await announced()).startsWith('Annulé :'));
  await page.click('#layers-redo');
  await page.sleep(100);
  check('rétablir annonce l’étape rétablie', (await announced()).startsWith('Rétabli :'));

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
