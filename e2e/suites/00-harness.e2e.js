// @ts-check
/**
 * La suite qui vérifie le banc lui-même : un banc qui ne sait pas distinguer un vrai clic d'un clic perdu ne prouve rien.
 * Chaque contrôle a un pendant négatif (ce qui ne doit PAS arriver n'arrive pas).
 */
export const name = 'banc d’essai';

const PAGE = `
<button id="ok" style="position:absolute;left:20px;top:20px;width:120px;height:40px">ok</button>
<button id="covered" style="position:absolute;left:20px;top:100px;width:120px;height:40px">couvert</button>
<div id="cover" style="position:absolute;left:0;top:90px;width:200px;height:60px"></div>
<input id="field" style="position:absolute;left:20px;top:180px">
<div id="source" draggable="true" style="position:absolute;left:20px;top:240px;width:80px;height:40px;background:#ccc">src</div>
<div id="target" style="position:absolute;left:220px;top:240px;width:80px;height:40px;background:#aaa">dst</div>
<script>
  window.log = [];
  const log = (entry) => window.log.push(entry);
  ok.addEventListener('click', () => log('ok'));
  covered.addEventListener('click', () => log('covered'));
  field.addEventListener('input', () => log('input:' + field.value));
  document.addEventListener('keydown', (e) => log('key:' + (e.ctrlKey ? 'C-' : '') + (e.shiftKey ? 'S-' : '') + e.key));
  target.addEventListener('dragover', (e) => e.preventDefault());
  target.addEventListener('drop', (e) => { e.preventDefault(); log('drop'); });
  source.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'x'));
</script>`;

/** @param {*} ctx */
export async function run({ page, check }) {
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
  const log = () => page.evaluate('window.log.slice()');

  await page.click('#ok');
  check('un vrai clic atteint son bouton', (await log()).includes('ok'));

  await page.click('#covered');
  check('un bouton couvert ne reçoit PAS le clic (le banc ne triche pas)', !(await log()).includes('covered'));

  await page.fill('#field', '42');
  const entries = await log();
  check('une saisie déclenche l’événement input avec la valeur saisie', entries.includes('input:42'));
  await page.fill('#field', '7');
  check('remplacer un champ efface l’ancienne valeur', (await log()).includes('input:7') && (await page.evaluate('field.value')) === '7');

  await page.press('Control+Shift+z');
  const keys = (await log()).filter((entry) => entry.startsWith('key:'));
  check('un raccourci porte ses modificateurs (Ctrl+Maj+Z)', keys.includes('key:C-S-Z'));
  check('une touche seule ne porte aucun modificateur', (await (async () => { await page.press('Delete'); return (await log()).includes('key:Delete'); })()));

  await page.drag('#source', '#target');
  check('un glisser-déposer HTML5 atteint la cible', (await log()).includes('drop'));
  await page.drag('#source', '#ok');
  check('déposer hors cible ne déclenche pas le dépôt de la cible', (await log()).filter((entry) => entry === 'drop').length === 1);
}
