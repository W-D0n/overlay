// @ts-check
/**
 * The starting points of a Code layer in the real Studio: choosing one puts its HTML, CSS, JavaScript and settings in the layer in one history step and rebuilds the form;
 * code the author wrote is not replaced without a second click; each script runs in the isolated page without reporting an error (the WebGL cube included).
 */
import { openStudio } from '../studio.js';

export const name = 'modèles de départ du code';

const JS_FIELD = '#fields textarea[aria-label="JavaScript"]';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const codes = () => page.evaluate("[...document.querySelectorAll('#fields textarea.code-input')].map((t) => t.value)");
  const paramLabels = () => page.evaluate("[...document.querySelectorAll('#fields .params-field label, #fields .params-field .param-label')].map((e) => e.textContent)");
  const reportText = () => page.evaluate("[...document.querySelectorAll('#fields .field-status')].map((p) => p.textContent).join('|')");
  const starter = '#fields .starter-row';

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="code"]');
  await page.waitFor("document.querySelectorAll('#bg-layer iframe').length === 1", 8000);
  await page.sleep(500);

  check('a Code layer offers "Modèle de départ" with the three starting points', (await page.evaluate(`[...document.querySelectorAll('${starter} option')].map((o) => o.textContent).join('|')`)) === 'Choisir un modèle…|Titre qui se révèle|Particules (canvas 2D)|Cube 3D (WebGL)' ? true : await page.evaluate(`[...document.querySelectorAll('${starter} option')].map((o) => o.textContent).join('|')`));
  check('"Appliquer" is disabled until one is chosen', await page.evaluate(`document.querySelector('${starter} button').disabled`));

  await page.selectOption(`${starter} select`, 'particules');
  check('choosing one shows what it does and enables the button', (await page.evaluate("document.querySelector('#fields .starter-row + .field-help').textContent")).includes('particules') && !(await page.evaluate(`document.querySelector('${starter} button').disabled`)) ? true : 'help');

  const undoBefore = await page.evaluate("document.getElementById('layers-undo').title");
  await page.click(`${starter} button`);
  await page.sleep(900);
  const [html, css, js, spec] = await codes();
  check('the default code is replaced without asking: canvas HTML, particles script, their settings', html.includes('<canvas') && js.includes('particles') && spec.includes('"nombre"') ? true : [html, js.slice(0, 40), spec.slice(0, 40)]);
  check('the settings form is rebuilt from the new declaration', (await page.evaluate("[...document.querySelectorAll('#fields .params-field input, #fields .params-field select')].length")) >= 3);
  check('the script runs in the isolated page without an error', (await reportText()).trim() === '' || (await reportText()).replace(/\|/g, '').trim() === '' ? true : await reportText());
  check('applying is one history step', (await page.evaluate("document.getElementById('layers-undo').title")) !== undoBefore);

  // Code the author wrote is not replaced at the first click.
  await page.fill(JS_FIELD, '// mon code\nconsole.log(1);\n');
  await page.sleep(300);
  await page.selectOption(`${starter} select`, 'cube-webgl');
  await page.click(`${starter} button`);
  check('over code the author wrote, the first click asks', (await page.evaluate(`document.querySelector('${starter} button').textContent`)) === 'Remplacer mon code ?' && (await codes())[2].startsWith('// mon code') ? true : [await page.evaluate(`document.querySelector('${starter} button').textContent`), (await codes())[2].slice(0, 30)]);
  await page.click(`${starter} button`);
  await page.sleep(1200);
  check('the second click replaces it with the cube', (await codes())[2].includes('WebGL') && (await codes())[3].includes('"taille"') ? true : (await codes())[2].slice(0, 40));
  check('the WebGL cube runs without an error in the isolated page', (await reportText()).replace(/\|/g, '').trim() === '' ? true : await reportText());

  await page.click('#layers-undo');
  await page.sleep(500);
  check('one undo gives the author code back, all four fields together', (await codes())[2].startsWith('// mon code') && (await codes())[3].includes('"nombre"') ? true : (await codes())[2].slice(0, 30));

  await page.selectOption(`${starter} select`, 'titre-revele');
  await page.click(`${starter} button`);
  await page.click(`${starter} button`);
  await page.sleep(700);
  check('the title template needs no script and applies', (await codes())[0].includes('class="titre"') ? true : (await codes())[0]);
  // The editor itself: line numbers, Tab, Enter, Shift+Tab, Escape then Tab.
  const jsText = () => page.evaluate("document.querySelector('#fields textarea[aria-label=\"JavaScript\"]').value");
  const gutter = () => page.evaluate("document.querySelector('#fields textarea[aria-label=\"JavaScript\"]').closest('.code-editor').querySelector('.code-gutter').textContent");
  const focused = () => page.evaluate("document.activeElement.getAttribute('aria-label')");
  await page.fill(JS_FIELD, 'function f() {');
  await page.press('Enter');
  check('Enter after an opening bracket indents the next line', (await jsText()) === 'function f() {\n  ' ? true : JSON.stringify(await jsText()));
  await page.press('x');
  await page.press('Enter');
  check('Enter keeps the indentation of the line', (await jsText()) === 'function f() {\n  x\n  ' ? true : JSON.stringify(await jsText()));
  await page.press('Shift+Tab');
  check('Shift+Tab takes one indentation off the line', (await jsText()) === 'function f() {\n  x\n' ? true : JSON.stringify(await jsText()));
  await page.press('Tab');
  check('Tab inserts two spaces instead of leaving the field', (await jsText()) === 'function f() {\n  x\n  ' && (await focused()) === 'JavaScript' ? true : JSON.stringify(await jsText()));
  await page.evaluate("document.execCommand('undo')");
  check('the browser undo takes that indentation back alone (the edit is a real edit)', (await jsText()) === 'function f() {\n  x\n' ? true : JSON.stringify(await jsText()));
  check('the line numbers follow the text', (await gutter()) === '1\n2\n3' ? true : JSON.stringify(await gutter()));
  await page.press('Escape');
  await page.press('Tab');
  check('Escape then Tab leaves the field: the keyboard is never trapped', (await focused()) !== 'JavaScript' ? true : 'still in the field');

  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
  void css;
}
