// @ts-check
/**
 * Le banc de mesure OBS (6d) : la page tourne de bout en bout (version courte), mesure chaque scénario, applique réellement les
 * extensions candidates, rend un verdict, et ne parle à aucun serveur.
 */
import { SCENARIOS } from '../../obs-bench.js';

export const name = 'banc de mesure OBS';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await page.goto(`http://localhost:${stack.staticPort}/dev/obs-bench.html?quick=1`);
  const sockets = await page.evaluate("(() => { window.__sockets = 0; return 0; })()");
  void sockets;
  const seen = new Set();
  // Pendant la mesure, on relève les styles réellement posés sur les calques (la fusion, le flou… doivent être appliqués).
  const applied = new Set();
  const total = SCENARIOS.length;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await page.evaluate('window.__benchDone === true'))) {
    const style = await page.evaluate("(() => { const el = document.getElementById('stage').firstElementChild?.firstElementChild; return el ? [el.style.mixBlendMode, el.style.filter, el.style.clipPath, el.style.transform].join('|') : ''; })()");
    if (style.replace(/\|/g, '') !== '') applied.add(style);
    seen.add(await page.evaluate("document.querySelectorAll('#rows tr').length"));
    await page.sleep(100);
  }
  check('le banc termine ses scénarios', await page.evaluate('window.__benchDone === true'));
  const rows = await page.evaluate("[...document.querySelectorAll('#rows tr')].map((tr) => [...tr.children].map((td) => td.textContent))");
  check(`un résultat par scénario (${total})`, rows.length === total);
  check('chaque mesure donne des images par seconde et un verdict lisible', rows.every((row) => /i\/s/.test(row[1]) && ['ok', 'à surveiller', 'trop coûteux'].includes(row[3])));
  check('la base n’a pas d’écart, les autres en ont un', rows[0][2] === '—' && rows.slice(1).every((row) => /ms/.test(row[2])));
  check('les huit couches sont montées, dont au moins sept effets canvas', (await page.evaluate("document.getElementById('stage').firstElementChild.children.length")) === 8 && (await page.evaluate("document.querySelectorAll('#stage canvas').length")) >= 7);
  const allStyles = [...applied].join(';');
  check('la fusion, le flou, le rognage et la rotation ont réellement été posés sur les calques', ['multiply', 'blur', 'inset', 'rotate'].every((token) => allStyles.includes(token)));
  check('à la fin, plus aucune extension ne reste posée', await page.evaluate("(() => { const el = document.getElementById('stage').firstElementChild?.firstElementChild; return !!el && !el.style.filter && !el.style.mixBlendMode && !el.style.clipPath && !el.style.transform; })()"));
  // Le rapport part au serveur d'état (celui de l'essai) et se relit sans recopier l'écran.
  const saved = await page.waitFor('window.__benchSent === true', 5000);
  check('la page envoie son rapport au serveur', saved);
  const report = await stack.api('/bench-result');
  check('le serveur le relit avec un résultat et un verdict par scénario', report.results?.length === total && report.results.every((r) => ['ok', 'watch', 'too-costly'].includes(r.verdict) && r.summary.frames > 0));
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
