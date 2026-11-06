// @ts-check
/**
 * La couche Shader : un fragment GLSL calculé par la carte graphique. La preuve est le **pixel dessiné** : un crochet posé sur `drawArrays` lit, juste après
 * chaque dessin, le pixel central du canvas (le tampon n'est plus lisible une fois l'image composée). On vérifie ainsi la couleur rendue, la résolution de la
 * source de référence vue par le shader, la qualité, l'animation d'un réglage par la timeline, la réaction à une alerte, l'erreur de compilation qui laisse le
 * dernier programme valide à l'antenne, et la libération du contexte graphique à la suppression de la couche.
 */
import { openStudio } from '../studio.js';

export const name = 'couche shader';

const GLSL_FIELD = '#fields textarea[aria-label="Shader (GLSL)"]';
const SPEC_FIELD = '#fields textarea[aria-label="Réglages exposés (JSON)"]';
const GLSL_STATUS = '#fields .code-field:has(textarea[aria-label="Shader (GLSL)"]) .field-status';

const solid = (/** @type {string} */ expression) => `void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = ${expression};\n}\n`;

/** Pose, dans la page, un crochet sur `drawArrays` qui lit le pixel central juste après chaque dessin, et note les canvas WebGL. */
const HOOK = `(() => {
    window.__glCanvases = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const context = getContext.call(this, type, ...rest);
      if (type === 'webgl2' && context && !window.__glCanvases.includes(this)) window.__glCanvases.push(this);
      return context;
    };
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      draw.apply(this, args);
      const c = this.canvas;
      const pixel = new Uint8Array(4);
      this.readPixels((c.width / 2) | 0, (c.height / 2) | 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
      window.__px = [...pixel];
      window.__size = [c.width, c.height];
      window.__draws = (window.__draws || 0) + 1;
    };
  })()`;

/** @param {*} ctx */
export async function run({ page, stack, check }) {
  await openStudio({ page, stack });
  const hasWebGl = await page.evaluate("document.createElement('canvas').getContext('webgl2') !== null");
  check('le navigateur d’essai fournit WebGL2 (sans lui, rien de ce qui suit ne se prouve)', hasWebGl);
  if (!hasWebGl) return;

  await page.evaluate(HOOK);
  /** Attend un pixel central qui vérifie la condition (sur `p`, [r, g, b, a] de 0 à 255). @param {string} condition */
  const pixel = (condition) => page.waitFor(`(() => { const p = window.__px; return p !== undefined && (${condition}); })()`, 8000);
  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(150);
  };

  // ── Ajout par la galerie ────────────────────────────────────────────────
  await page.click('#layers-add');
  const card = await page.evaluate("(() => { const c = document.querySelector('#gallery-grid [data-kind=\"shader\"]'); return c === null ? null : { label: c.querySelector('.gallery-label').textContent, thumbnails: c.querySelectorAll('.preset-thumb').length, canvases: c.querySelectorAll('canvas').length }; })()");
  check('la galerie propose « Shader », sans vignette ni contexte graphique monté pour elle', card !== null && card.label === 'Shader' && card.thumbnails === 0 && card.canvases === 0 ? true : card);
  await page.click('#gallery-grid [data-kind="shader"]');
  await page.waitFor("window.__glCanvases.length === 1", 8000);
  check('une seule couche WebGL est montée : celle de l’aperçu', await page.evaluate('window.__glCanvases.length === 1'));
  check('le shader d’exemple dessine : le pixel central est opaque et colore', await pixel('p[3] > 0 && p[0] + p[1] + p[2] > 0'));
  check('le formulaire est généré : le shader, la déclaration, trois réglages (une couleur, deux curseurs), la qualité', await page.evaluate("document.querySelectorAll('#fields textarea.code-input').length === 2 && document.querySelectorAll('#fields .params-field input[type=range]').length === 2 && document.querySelectorAll('#fields .params-field .color-control').length === 1"));

  // ── Une couleur écrite dans le shader est celle qui sort ──
  await page.fill(GLSL_FIELD, solid('vec4(1.0, 0.0, 0.0, 1.0)'));
  check('le shader écrit est compilé et dessine : rouge opaque', await pixel('p[0] === 255 && p[1] === 0 && p[2] === 0 && p[3] === 255'));

  // ── Résolution : celle de la source de référence, jamais celle de l'aperçu ──
  await page.fill(GLSL_FIELD, solid('vec4(uResolution.x / 2000.0, uResolution.y / 2000.0, 0.0, 1.0)'));
  const preview = await page.evaluate("(() => { const r = window.__glCanvases[0].getBoundingClientRect(); return { width: r.width, height: r.height }; })()");
  check('le shader voit 1920×1080 (rouge 0,96 · vert 0,54), quelle que soit la taille de l’aperçu', await pixel('Math.abs(p[0] - 245) <= 1 && Math.abs(p[1] - 138) <= 1') ? true : { preview, pixel: await page.evaluate('window.__px') });

  // ── Qualité : moins de pixels calculés, même composition ──
  const full = await page.evaluate('window.__size');
  await page.evaluate(`(() => {
    const label = [...document.querySelectorAll('#fields label')].find((l) => l.textContent === 'Qualité de rendu');
    const select = label.nextElementSibling.matches('select') ? label.nextElementSibling : label.nextElementSibling.querySelector('select');
    select.value = 'quarter';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await page.waitFor(`window.__size[0] <= ${Math.ceil(full[0] / 4) + 1}`, 8000);
  const quarter = await page.evaluate('window.__size');
  check('« Quart » calcule le quart des pixels en largeur et en hauteur', Math.abs(quarter[0] * 4 - full[0]) <= 4 && Math.abs(quarter[1] * 4 - full[1]) <= 4 ? true : { full, quarter });
  check('la composition ne change pas avec la qualité : le shader voit toujours 1920×1080', await pixel('Math.abs(p[0] - 245) <= 1 && Math.abs(p[1] - 138) <= 1'));
  await page.evaluate(`(() => {
    const label = [...document.querySelectorAll('#fields label')].find((l) => l.textContent === 'Qualité de rendu');
    const select = label.nextElementSibling.matches('select') ? label.nextElementSibling : label.nextElementSibling.querySelector('select');
    select.value = 'full';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  // ── Erreur de compilation : dite sous le champ, le dernier programme valide reste à l'antenne ──
  await page.fill(GLSL_FIELD, solid('vec4(0.0, 0.0, 1.0, 1.0)'));
  check('un nouveau shader valide remplace le précédent : bleu', await pixel('p[0] === 0 && p[1] === 0 && p[2] === 255'));
  await page.fill(GLSL_FIELD, 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(nope);\n}\n');
  const shown = await page.waitFor(`(() => { const s = document.querySelector(${JSON.stringify(GLSL_STATUS)}); return s !== null && s.dataset.level === 'error' && s.textContent.includes('nope'); })()`, 8000);
  const status = await page.evaluate(`document.querySelector(${JSON.stringify(GLSL_STATUS)}).textContent`);
  check('l’erreur du compilateur est dite sous le champ, à la ligne de ce code (ligne 2)', shown && status.startsWith('ligne 2 : ') ? true : status);
  const drawsBefore = await page.evaluate('window.__draws');
  const goesOn = await page.waitFor(`window.__draws >= ${drawsBefore + 3}`, 5000);
  check('le dernier programme valide continue de dessiner : de nouvelles images sont calculées, toujours bleues', goesOn && await pixel('p[0] === 0 && p[1] === 0 && p[2] === 255'));
  await page.fill(GLSL_FIELD, 'void other() {}\n');
  await page.waitFor(`(() => { const s = document.querySelector(${JSON.stringify(GLSL_STATUS)}); return s !== null && s.textContent.includes('mainImage'); })()`, 8000);
  check('un shader sans mainImage dit ce qui manque, sans fausse ligne', !(await page.evaluate(`document.querySelector(${JSON.stringify(GLSL_STATUS)}).textContent`)).startsWith('ligne'));

  // ── Réglage animé par la timeline : le pixel suit la courbe ──
  await page.fill(SPEC_FIELD, '[ { "key": "niveau", "label": "Niveau", "type": "number", "default": 0.25, "min": 0, "max": 1, "step": 0.01 } ]');
  await page.fill(GLSL_FIELD, solid('vec4(vec3(u_niveau), 1.0)'));
  check('le réglage déclaré est transmis : valeur par défaut 0,25 → gris 64', await pixel('Math.abs(p[0] - 64) <= 1 && p[0] === p[1] && p[1] === p[2]'));
  await page.click('#timeline-toggle');
  const options = await page.evaluate("[...document.querySelectorAll('#timeline-target option')].map((o) => o.value)");
  check('la timeline propose le réglage du shader', options.includes('param:niveau') ? true : options);
  await page.selectOption('#timeline-target', 'param:niveau');
  await seek(0);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 0);
  await seek(2000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 1);
  await seek(0);
  check('au début de la piste le shader est noir', await pixel('p[0] === 0'));
  await seek(1000);
  check('à mi-parcours il est gris moyen (courbe symétrique : 128)', await pixel('Math.abs(p[0] - 128) <= 2'));
  await seek(2000);
  check('à la fin il est blanc', await pixel('p[0] === 255'));

  // ── Alerte : uAlert repart de zéro ──
  await page.fill(GLSL_FIELD, solid('vec4(vec3(exp(-uAlert * 0.5)), 1.0)'));
  await page.evaluate("document.getElementById('timeline-play').getAttribute('aria-pressed') === 'true' || document.getElementById('timeline-play').click()");
  check('avant toute alerte le shader est noir (uAlert est « jamais »)', await pixel('p[0] === 0'));
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  check('une alerte allume le shader (uAlert repart de zéro)', await pixel('p[0] >= 200'));

  // ── Suppression : le contexte graphique est rendu ──
  const before = await page.evaluate('window.__glCanvases.length');
  await page.evaluate("window.__shaderCanvas = window.__glCanvases[0]");
  await page.click('#layers-remove');
  const released = await page.waitFor("window.__shaderCanvas.getContext('webgl2').isContextLost()", 8000);
  check('supprimer la couche rend son contexte graphique (le navigateur n’en garde qu’une quinzaine)', released && before === 1);

  // ── La vraie page de rendu (celle d'OBS), dans une fenêtre qui n'a pas le rapport de la source de référence ──
  const layer = { id: 'sh', kind: 'shader', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 0.5, height: 1 }, options: { glsl: solid('vec4(uResolution.x / 2000.0, uResolution.y / 2000.0, 0.0, 1.0)'), paramSpec: '[]', params: {}, quality: 'full', audioReactive: false } };
  await stack.api('/state', { scene: { version: 1, id: 'shader-obs', name: 'Shader OBS', layers: [layer] } });
  await page.goto(`http://localhost:${stack.staticPort}/background.html?transparent=1&role=studio`);
  const mounted = await page.waitFor("document.querySelectorAll('#bg-layer canvas').length >= 2", 15_000);
  await page.evaluate(HOOK);
  const window_ = await page.evaluate('[innerWidth, innerHeight]');
  check('la page de rendu n’a pas la taille ni le rapport de la source de référence (sinon l’essai ne prouverait rien)', Math.abs(window_[0] / window_[1] - 16 / 9) > 0.1 ? true : window_);
  // Une moitié de largeur sur une fenêtre de hauteur H : la hauteur de référence est 1080, la largeur de référence est (largeur de la zone) × 1080 / H.
  const expectedRed = Math.round((window_[0] * 0.5 * 1080 / window_[1]) / 2000 * 255);
  const reference = mounted && await pixel(`Math.abs(p[0] - ${expectedRed}) <= 1 && Math.abs(p[1] - 138) <= 1`);
  check(`le shader de la vraie page voit la hauteur de référence (1080) et la largeur qui en découle, quelle que soit la fenêtre (rouge ${expectedRed}, vert 138)`, reference ? true : await page.evaluate('window.__px'));
}
