// @ts-check
import { BEZIER_LIMITS, BEZIER_PRESETS, isBezier } from '../cubic-bezier.js';
import { easeValue } from '../layer-timeline.js';

/**
 * dev/curve-editor.js — L'éditeur de la courbe d'une image clé (`cubic-bezier.js`) : un dessin de la courbe entre deux images clés, deux poignées qu'on glisse (ou qu'on déplace
 * aux flèches, `Maj` pour aller plus finement), les quatre nombres de la courbe et des préréglages. Pour une courbe qui n'est pas personnalisée, il ne montre que le dessin.
 * Il ne connaît ni l'éditeur ni le document : il reçoit la courbe à montrer (`show`) et rend celle qu'on règle (`onChange`), telle quelle : c'est le modèle (`changeKey`) qui la borne
 * et l'arrondit.
 *
 * Le dessin va de 0 à 1 en abscisse (le temps entre les deux images) et de -0,75 à 1,75 en ordonnée : de quoi voir un rebond ou une anticipation ; une poignée ne se glisse pas
 * plus loin (les champs numériques, eux, vont jusqu'aux bornes de `BEZIER_LIMITS`).
 *
 * @param {{
 *   root: HTMLElement,
 *   onChange: (bezier: import('../cubic-bezier.js').Bezier) => void,
 *   documentRef?: Document,
 * }} input
 */
export function createCurveEditor(input) {
  const documentRef = input.documentRef ?? document;
  const { root } = input;
  const SVG = 'http://www.w3.org/2000/svg';
  const WIDTH = 160;
  const HEIGHT = 200;
  const MARGIN = 20;
  const VIEW = { min: -0.75, max: 1.75 };
  const STEP = 0.05;

  /** @param {number} x */
  const px = (x) => MARGIN + x * (WIDTH - 2 * MARGIN);
  /** @param {number} value */
  const py = (value) => MARGIN + ((VIEW.max - value) / (VIEW.max - VIEW.min)) * (HEIGHT - 2 * MARGIN);
  /** @param {number} left @param {number} top @param {DOMRect} rect @returns {{ x: number, y: number }} le point du dessin sous le pointeur */
  const fromPointer = (left, top, rect) => ({
    x: ((left - rect.left) / rect.width * WIDTH - MARGIN) / (WIDTH - 2 * MARGIN),
    y: VIEW.max - (((top - rect.top) / rect.height * HEIGHT - MARGIN) / (HEIGHT - 2 * MARGIN)) * (VIEW.max - VIEW.min),
  });

  /** @param {string} name @param {Record<string, string | number>} attributes */
  function svgNode(name, attributes) {
    const el = documentRef.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    return el;
  }

  const svg = svgNode('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT, class: 'tl-curve-svg', role: 'img', 'aria-label': 'Courbe entre deux images clés : le temps en abscisse, la valeur en ordonnée' });
  const unit = svgNode('rect', { x: px(0), y: py(1), width: px(1) - px(0), height: py(0) - py(1), class: 'tl-curve-unit' });
  const diagonal = svgNode('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1), class: 'tl-curve-guide' });
  const arm1 = svgNode('line', { class: 'tl-curve-arm' });
  const arm2 = svgNode('line', { class: 'tl-curve-arm' });
  const path = svgNode('polyline', { class: 'tl-curve-line', fill: 'none' });
  const handles = [0, 1].map((index) => {
    const handle = svgNode('circle', { r: 7, class: 'tl-curve-handle', tabindex: 0, role: 'slider', 'aria-label': `Point de contrôle ${index + 1}` });
    handle.dataset.handle = String(index);
    return handle;
  });
  svg.append(unit, diagonal, arm1, arm2, path, ...handles);
  root.appendChild(svg);

  const controls = documentRef.createElement('div');
  controls.className = 'tl-curve-controls';
  const preset = documentRef.createElement('select');
  preset.setAttribute('aria-label', 'Préréglage de courbe');
  const none = documentRef.createElement('option');
  none.value = '';
  none.textContent = 'Préréglage…';
  preset.appendChild(none);
  for (const entry of BEZIER_PRESETS) {
    const option = documentRef.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    preset.appendChild(option);
  }
  controls.appendChild(preset);
  const names = ['x1', 'y1', 'x2', 'y2'];
  const fields = names.map((name, at) => {
    const wrap = documentRef.createElement('label');
    wrap.className = 'tl-field';
    wrap.append(documentRef.createTextNode(`${name} `));
    const field = documentRef.createElement('input');
    field.type = 'number';
    field.step = String(STEP);
    const limits = at % 2 === 0 ? BEZIER_LIMITS.x : BEZIER_LIMITS.y;
    field.min = String(limits.min);
    field.max = String(limits.max);
    field.dataset.point = name;
    field.setAttribute('aria-label', `Courbe : ${name}`);
    wrap.appendChild(field);
    controls.appendChild(wrap);
    return field;
  });
  root.appendChild(controls);

  /** La courbe montrée : `null` quand la courbe de l'image clé n'est pas personnalisée (dessin seul, rien à régler). @type {import('../cubic-bezier.js').Bezier | null} */
  let current = null;

  /** @param {import('../layer-timeline.js').Ease} ease @param {import('../cubic-bezier.js').Bezier | undefined} bezier */
  function draw(ease, bezier) {
    const points = [];
    for (let step = 0; step <= 48; step += 1) points.push(`${px(step / 48)},${py(easeValue(ease, step / 48, bezier))}`);
    // Un palier saute à la valeur suivante à l'arrivée : le dessin le dit.
    if (ease === 'hold') points.push(`${px(1)},${py(1)}`);
    path.setAttribute('points', points.join(' '));
  }

  /** @param {import('../cubic-bezier.js').Bezier} bezier */
  function place(bezier) {
    const [x1, y1, x2, y2] = bezier;
    const at = (/** @type {number} */ value) => Math.min(VIEW.max, Math.max(VIEW.min, value));
    arm1.setAttribute('x1', String(px(0)));
    arm1.setAttribute('y1', String(py(0)));
    arm1.setAttribute('x2', String(px(x1)));
    arm1.setAttribute('y2', String(py(at(y1))));
    arm2.setAttribute('x1', String(px(1)));
    arm2.setAttribute('y1', String(py(1)));
    arm2.setAttribute('x2', String(px(x2)));
    arm2.setAttribute('y2', String(py(at(y2))));
    handles[0].setAttribute('cx', String(px(x1)));
    handles[0].setAttribute('cy', String(py(at(y1))));
    handles[1].setAttribute('cx', String(px(x2)));
    handles[1].setAttribute('cy', String(py(at(y2))));
    handles[0].setAttribute('aria-valuetext', `x ${x1}, y ${y1}`);
    handles[1].setAttribute('aria-valuetext', `x ${x2}, y ${y2}`);
    fields.forEach((field, index) => {
      if (documentRef.activeElement !== field) field.value = String(bezier[index]);
    });
  }

  /**
   * Règle l'un des deux points de contrôle.
   * @param {number} index 0 ou 1
   * @param {number} x @param {number} y
   */
  function setPoint(index, x, y) {
    if (current === null) return;
    const next = /** @type {import('../cubic-bezier.js').Bezier} */ ([...current]);
    next[index * 2] = x;
    next[index * 2 + 1] = y;
    input.onChange(next);
  }

  for (const handle of handles) {
    const index = Number(handle.dataset.handle);
    handle.addEventListener('pointerdown', (event) => {
      if (current === null || event.button !== 0) return;
      event.preventDefault();
      handle.focus();
      const move = (/** @type {PointerEvent} */ moveEvent) => {
        const point = fromPointer(moveEvent.clientX, moveEvent.clientY, svg.getBoundingClientRect());
        setPoint(index, point.x, Math.min(VIEW.max, Math.max(VIEW.min, point.y)));
      };
      const stop = () => {
        documentRef.removeEventListener('pointermove', move);
        documentRef.removeEventListener('pointerup', stop);
        documentRef.removeEventListener('pointercancel', stop);
      };
      documentRef.addEventListener('pointermove', move);
      documentRef.addEventListener('pointerup', stop);
      documentRef.addEventListener('pointercancel', stop);
    });
    handle.addEventListener('keydown', (event) => {
      if (current === null) return;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const move = arrows[/** @type {keyof typeof arrows} */ (event.key)];
      if (move === undefined) return;
      event.preventDefault();
      const size = event.shiftKey ? STEP / 5 : STEP;
      setPoint(index, current[index * 2] + move[0] * size, current[index * 2 + 1] + move[1] * size);
    });
  }

  fields.forEach((field) => {
    field.addEventListener('input', () => {
      const typed = fields.map((other) => Number.parseFloat(other.value.replace(',', '.')));
      if (current === null || typed.some((value) => !Number.isFinite(value))) return;
      input.onChange(/** @type {import('../cubic-bezier.js').Bezier} */ (typed));
    });
    field.addEventListener('blur', () => { if (current !== null) place(current); });
  });

  preset.addEventListener('change', () => {
    const chosen = BEZIER_PRESETS.find(({ id }) => id === preset.value);
    preset.value = '';
    if (chosen !== undefined && current !== null) input.onChange(/** @type {import('../cubic-bezier.js').Bezier} */ ([...chosen.bezier]));
  });

  return {
    /**
     * Montre la courbe d'une image clé.
     * @param {{ ease: import('../layer-timeline.js').Ease, bezier?: import('../cubic-bezier.js').Bezier }} key
     */
    show(key) {
      current = key.ease === 'bezier' && isBezier(key.bezier) ? key.bezier : null;
      const custom = current !== null;
      draw(key.ease, current ?? undefined);
      controls.hidden = !custom;
      for (const handle of handles) handle.style.display = custom ? '' : 'none';
      for (const arm of [arm1, arm2]) arm.style.display = custom ? '' : 'none';
      if (current !== null) place(current);
    },
  };
}
