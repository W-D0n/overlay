// @ts-check
/**
 * src/components/shape-geometry.js — La géométrie d'une couche forme : pur, sans canvas ni DOM. Une forme remplit la zone de sa couche,
 * réduite de la moitié du contour pour qu'il ne soit jamais rogné par le bord ; `ShapeLayer` n'a plus qu'à la peindre.
 *
 * @typedef {{ type: 'rect', x: number, y: number, width: number, height: number, radius: number }
 *   | { type: 'ellipse', cx: number, cy: number, rx: number, ry: number }
 *   | { type: 'polygon', points: [number, number][] }
 *   | { type: 'line', x1: number, y1: number, x2: number, y2: number }} ShapePath
 */

/**
 * Le tracé d'une forme dans une zone.
 * @param {{ shape: string, width: number, height: number, strokeWidth: number, cornerRadius: number }} input
 * @returns {ShapePath | null} `null` quand la zone est trop petite pour contenir la forme
 */
export function shapePath({ shape, width, height, strokeWidth, cornerRadius }) {
  const inset = shape === 'line' ? 0 : strokeWidth / 2;
  const w = width - 2 * inset;
  const h = height - 2 * inset;
  if (w <= 0 || h <= 0) return null;
  const x = inset;
  const y = inset;
  switch (shape) {
    case 'ellipse': return { type: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
    case 'triangle': return { type: 'polygon', points: [[x + w / 2, y], [x + w, y + h], [x, y + h]] };
    case 'diamond': return { type: 'polygon', points: [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]] };
    // L'épaisseur d'une ligne est celle du contour (`ShapeLayer`) ; elle traverse la zone et reste dans sa hauteur.
    case 'line': return { type: 'line', x1: 0, y1: height / 2, x2: width, y2: height / 2 };
    default: return { type: 'rect', x, y, width: w, height: h, radius: Math.min(cornerRadius, w / 2, h / 2) };
  }
}

/**
 * Les extrémités du dégradé linéaire d'une zone, pour un angle en degrés (0° = vers la droite, 90° = vers le bas, comme un
 * `linear-gradient` CSS tourné d'un quart de tour) : la longueur couvre exactement la zone, du coin au coin opposé.
 * @param {number} angle
 * @param {number} width
 * @param {number} height
 * @returns {{ x0: number, y0: number, x1: number, y1: number }}
 */
export function gradientLine(angle, width, height) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/**
 * La longueur du contour d'une forme, en unités de la zone : ce qu'il faut pour le tracer progressivement (`strokeDash`). L'ellipse suit l'approximation de Ramanujan (juste à quelques dix-millièmes).
 * @param {ShapePath} path
 * @returns {number}
 */
export function pathLength(path) {
  switch (path.type) {
    case 'rect': return 2 * (path.width + path.height) - (8 - 2 * Math.PI) * path.radius;
    case 'ellipse': {
      const a = path.rx;
      const b = path.ry;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    case 'polygon': return path.points.reduce((total, [x, y], index) => {
      const [nextX, nextY] = path.points[(index + 1) % path.points.length];
      return total + Math.hypot(nextX - x, nextY - y);
    }, 0);
    default: return Math.hypot(path.x2 - path.x1, path.y2 - path.y1);
  }
}

/** Part de la durée pendant laquelle le contour se trace ; le remplissage apparaît ensuite, en fondu, sur la seconde moitié. */
export const TRACE_STROKE_PART = 0.7;
export const TRACE_FILL_FROM = 0.5;

/**
 * Ce qu'une présence de la forme de 0 (rien) à 1 (entière) donne à voir : la part du contour tracée et l'opacité du remplissage.
 * @param {number} presence
 * @returns {{ stroke: number, fill: number }}
 */
export function traceParts(presence) {
  return {
    stroke: Math.min(1, Math.max(0, presence / TRACE_STROKE_PART)),
    fill: Math.min(1, Math.max(0, (presence - TRACE_FILL_FROM) / (1 - TRACE_FILL_FROM))),
  };
}
