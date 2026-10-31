import { describe, expect, test } from 'bun:test';
import { TEXT_DEFAULTS, layoutText, normalizeTextOptions, wrapLine } from './text-layout.js';

/** Une police factice : chaque caractère fait la moitié de la taille. */
const measure = (text, size) => text.length * size * 0.5;
const options = (over = {}) => normalizeTextOptions({ text: ['Bonjour'], fontSize: 100, ...over });

describe('normalizeTextOptions', () => {
  test('sans option, les défauts du schéma ; une option valide est gardée', () => {
    expect(normalizeTextOptions(undefined)).toEqual(TEXT_DEFAULTS);
    expect(normalizeTextOptions({ fontSize: 40, bold: false }).fontSize).toBe(40);
    expect(normalizeTextOptions({ bold: false }).bold).toBe(false);
  });

  test('un mauvais type ou une valeur hors liste retombe sur le défaut, un nombre hors bornes est borné', () => {
    const result = normalizeTextOptions({ fontSize: 'grand', align: 'diagonale', font: 'comic', text: [3], bold: 'oui', outlineWidth: 999 });
    expect(result.fontSize).toBe(TEXT_DEFAULTS.fontSize);
    expect(result.align).toBe('center');
    expect(result.font).toBe('serif');
    expect(result.text).toEqual(['Titre']);
    expect(result.bold).toBe(true);
    expect(result.outlineWidth).toBe(24);
  });
});

describe('wrapLine', () => {
  test('une ligne qui tient reste entière, une ligne vide aussi', () => {
    expect(wrapLine('abc', 100, (t) => t.length * 5)).toEqual(['abc']);
    expect(wrapLine('', 100, (t) => t.length * 5)).toEqual(['']);
  });

  test('coupe aux espaces', () => {
    expect(wrapLine('un deux trois', 30, (t) => t.length * 5)).toEqual(['un', 'deux', 'trois']);
    expect(wrapLine('un deux trois', 40, (t) => t.length * 5)).toEqual(['un deux', 'trois']);
  });

  test('un mot plus large que la zone se coupe aux lettres, sans boucle infinie', () => {
    const lines = wrapLine('anticonstitutionnellement', 50, (t) => t.length * 5);
    expect(lines.join('')).toBe('anticonstitutionnellement');
    expect(lines.every((line) => line.length * 5 <= 50)).toBe(true);
    expect(wrapLine('abc', 2, (t) => t.length * 5).join('')).toBe('abc');
  });
});

describe('layoutText', () => {
  const layout = (over, box = { width: 1000, height: 400 }) => layoutText({ options: options(over), box, measure });

  test('sans contrainte, la taille réglée est gardée et le bloc est centré verticalement', () => {
    const result = layout({});
    expect(result.size).toBe(100);
    expect(result.lines).toEqual(['Bonjour']);
    expect(result.fits).toBe(true);
    expect(result.top).toBeCloseTo((400 - 120) / 2, 5);
  });

  test('« réduire » : un texte trop large rétrécit jusqu’à tenir, sans passer sous la zone', () => {
    const result = layout({ text: ['Une ligne vraiment très longue'], wrap: false }, { width: 600, height: 400 });
    expect(result.size).toBeLessThan(100);
    expect(result.fits).toBe(true);
    expect(measure(result.lines[0], result.size)).toBeLessThanOrEqual(600 + 0.01);
    // La plus grande taille qui tient : un peu plus grand ne tient plus.
    expect(measure(result.lines[0], result.size + 0.6)).toBeGreaterThan(600);
  });

  test('« aucun » : la taille réglée est gardée même si le texte déborde', () => {
    const result = layout({ text: ['Une ligne vraiment très longue'], wrap: false, fit: 'none' }, { width: 600, height: 400 });
    expect(result.size).toBe(100);
    expect(result.fits).toBe(false);
  });

  test('le retour à la ligne s’applique d’abord, puis la taille réduit si la hauteur ne suffit pas', () => {
    const result = layout({ text: ['un deux trois quatre cinq six'], fontSize: 100 }, { width: 400, height: 200 });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.length * result.lineHeightPx).toBeLessThanOrEqual(200 + 0.01);
    expect(result.fits).toBe(true);
  });

  test('une zone minuscule donne la taille minimale, sans boucle ni erreur', () => {
    const result = layout({ text: ['Beaucoup trop de texte pour cette zone'] }, { width: 5, height: 5 });
    expect(result.size).toBe(4);
    expect(Number.isFinite(result.top)).toBe(true);
  });

  test('les majuscules sont mesurées en majuscules', () => {
    expect(layout({ text: ['abc'], uppercase: true }).lines).toEqual(['ABC']);
  });

  test('l’alignement vertical place le bloc en haut ou en bas', () => {
    expect(layout({ verticalAlign: 'top' }).top).toBe(0);
    expect(layout({ verticalAlign: 'bottom' }).top).toBeCloseTo(400 - 120, 5);
  });

  test('le contour réserve de la place des deux côtés', () => {
    const result = layout({ outlineWidth: 10, verticalAlign: 'top', align: 'left' });
    expect(result.top).toBe(10);
    expect(result.left).toBe(10);
    expect(result.right).toBe(990);
  });

  test('des lignes vides gardent leur hauteur', () => {
    expect(layout({ text: ['a', '', 'b'] }).lines).toEqual(['a', '', 'b']);
  });
});
