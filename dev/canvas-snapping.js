// @ts-check
/**
 * dev/canvas-snapping.js — L'aimantation de la manipulation directe : où une couche déplacée ou redimensionnée « colle », et
 * les repères à afficher. Logique pure, en pixels de la source.
 *
 * Cibles : les bords et le centre de la toile, des marges de sécurité, et les bords et centres des autres couches. Une
 * couche déplacée s'aimante par ses bords et son centre ; une couche redimensionnée, par le ou les bords qu'elle déplace.
 * La distance d'aimantation est fournie en pixels *d'écran* par l'appelant puis convertie : l'aimant garde la même force
 * à l'écran quel que soit le zoom.
 *
 * @typedef {import('./canvas-geometry.js').Rect} Rect
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 * @typedef {'canvas-edge' | 'canvas-center' | 'margin' | 'layer-edge' | 'layer-center'} TargetKind
 * @typedef {{ pos: number, kind: TargetKind, span: [number, number] }} Target
 * @typedef {{ axis: 'x' | 'y', pos: number, from: number, to: number, kind: TargetKind }} Guide
 */

/** Seuil sous lequel un bord est considéré comme aligné sur une cible (affichage d'un repère), en pixels de la source. */
const ALIGNED_EPSILON = 0.5;

/**
 * @param {{
 *   canvas: { width: number, height: number },
 *   others: readonly Rect[],
 *   margin?: number | { x: number, y: number } | null,
 * }} input `margin` : retrait des marges de sécurité en pixels de la source (un nombre pour les deux axes, ou un retrait par
 * axe), ou `null` pour ne pas en proposer
 * @returns {{ xs: Target[], ys: Target[] }}
 */
export function collectTargets({ canvas, others, margin = null }) {
  const marginX = margin === null ? 0 : typeof margin === 'number' ? margin : margin.x;
  const marginY = margin === null ? 0 : typeof margin === 'number' ? margin : margin.y;
  /** @type {Target[]} */
  const xs = [
    { pos: 0, kind: 'canvas-edge', span: [0, canvas.height] },
    { pos: canvas.width / 2, kind: 'canvas-center', span: [0, canvas.height] },
    { pos: canvas.width, kind: 'canvas-edge', span: [0, canvas.height] },
  ];
  /** @type {Target[]} */
  const ys = [
    { pos: 0, kind: 'canvas-edge', span: [0, canvas.width] },
    { pos: canvas.height / 2, kind: 'canvas-center', span: [0, canvas.width] },
    { pos: canvas.height, kind: 'canvas-edge', span: [0, canvas.width] },
  ];
  if (marginX > 0) xs.push({ pos: marginX, kind: 'margin', span: [0, canvas.height] }, { pos: canvas.width - marginX, kind: 'margin', span: [0, canvas.height] });
  if (marginY > 0) ys.push({ pos: marginY, kind: 'margin', span: [0, canvas.width] }, { pos: canvas.height - marginY, kind: 'margin', span: [0, canvas.width] });
  for (const rect of others) {
    xs.push(
      { pos: rect.x, kind: 'layer-edge', span: [rect.y, rect.y + rect.height] },
      { pos: rect.x + rect.width / 2, kind: 'layer-center', span: [rect.y, rect.y + rect.height] },
      { pos: rect.x + rect.width, kind: 'layer-edge', span: [rect.y, rect.y + rect.height] },
    );
    ys.push(
      { pos: rect.y, kind: 'layer-edge', span: [rect.x, rect.x + rect.width] },
      { pos: rect.y + rect.height / 2, kind: 'layer-center', span: [rect.x, rect.x + rect.width] },
      { pos: rect.y + rect.height, kind: 'layer-edge', span: [rect.x, rect.x + rect.width] },
    );
  }
  return { xs, ys };
}

/**
 * Le plus petit décalage qui amène l'une des `values` sur une cible, s'il tient dans le seuil.
 * @param {readonly number[]} values
 * @param {readonly Target[]} targets
 * @param {number} threshold
 * @returns {number | null}
 */
function nearestOffset(values, targets, threshold) {
  /** @type {number | null} */
  let best = null;
  for (const value of values) {
    for (const target of targets) {
      const offset = target.pos - value;
      if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
    }
  }
  return best;
}

/**
 * Les repères à tracer pour une boîte : une ligne par cible sur laquelle l'un de ses bords ou son centre tombe.
 * @param {Rect} box
 * @param {{ xs: readonly Target[], ys: readonly Target[] }} targets
 * @param {{ x: readonly number[], y: readonly number[] }} edges les valeurs de la boîte à comparer, par axe
 * @returns {Guide[]}
 */
function guidesFor(box, targets, edges) {
  /** @type {Guide[]} */
  const guides = [];
  for (const target of targets.xs) {
    if (!edges.x.some((value) => Math.abs(value - target.pos) <= ALIGNED_EPSILON)) continue;
    guides.push({ axis: 'x', pos: target.pos, from: Math.min(box.y, target.span[0]), to: Math.max(box.y + box.height, target.span[1]), kind: target.kind });
  }
  for (const target of targets.ys) {
    if (!edges.y.some((value) => Math.abs(value - target.pos) <= ALIGNED_EPSILON)) continue;
    guides.push({ axis: 'y', pos: target.pos, from: Math.min(box.x, target.span[0]), to: Math.max(box.x + box.width, target.span[1]), kind: target.kind });
  }
  return guides;
}

/**
 * Aimante un déplacement : le décalage à ajouter (par axe, 0 si rien ne colle) et les repères de la boîte une fois placée.
 * @param {Rect} box la boîte à sa position non aimantée
 * @param {{ xs: readonly Target[], ys: readonly Target[] }} targets
 * @param {number} threshold en pixels de la source
 * @returns {{ dx: number, dy: number, guides: Guide[] }}
 */
export function snapMove(box, targets, threshold) {
  const dx = nearestOffset([box.x, box.x + box.width / 2, box.x + box.width], targets.xs, threshold) ?? 0;
  const dy = nearestOffset([box.y, box.y + box.height / 2, box.y + box.height], targets.ys, threshold) ?? 0;
  const placed = { ...box, x: box.x + dx, y: box.y + dy };
  return {
    dx,
    dy,
    guides: guidesFor(placed, targets, { x: [placed.x, placed.x + placed.width / 2, placed.x + placed.width], y: [placed.y, placed.y + placed.height / 2, placed.y + placed.height] }),
  };
}

/**
 * Aimante un redimensionnement : seuls les bords que la poignée déplace collent ; les bords opposés restent où ils sont.
 * @param {Rect} box la boîte redimensionnée, non aimantée
 * @param {Handle} handle
 * @param {{ xs: readonly Target[], ys: readonly Target[] }} targets
 * @param {number} threshold
 * @returns {{ box: Rect, guides: Guide[] }}
 */
export function snapResize(box, handle, targets, threshold) {
  let { x, y, width, height } = box;
  /** @type {number[]} */
  const xEdges = [];
  /** @type {number[]} */
  const yEdges = [];
  if (handle.includes('w')) {
    const offset = nearestOffset([x], targets.xs, threshold) ?? 0;
    x += offset;
    width -= offset;
    xEdges.push(x);
  }
  if (handle.includes('e')) {
    const offset = nearestOffset([x + width], targets.xs, threshold) ?? 0;
    width += offset;
    xEdges.push(x + width);
  }
  if (handle.includes('n')) {
    const offset = nearestOffset([y], targets.ys, threshold) ?? 0;
    y += offset;
    height -= offset;
    yEdges.push(y);
  }
  if (handle.includes('s')) {
    const offset = nearestOffset([y + height], targets.ys, threshold) ?? 0;
    height += offset;
    yEdges.push(y + height);
  }
  const snapped = { x, y, width, height };
  return { box: snapped, guides: guidesFor(snapped, targets, { x: xEdges, y: yEdges }) };
}
