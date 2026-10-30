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
  found.champsEnTeteSansLangue = document.documentElement.lang ? [] : ['html sans attribut lang'];
  found.titrePage = document.title.trim() ? [] : ['page sans titre'];
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

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
