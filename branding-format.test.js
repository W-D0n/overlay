// @ts-check
import { expect, test } from 'bun:test';
import {
  brandingStyles,
  DEFAULT_BRANDING,
  hasBrandingContent,
  MAX_BRANDING_LINES,
  normalizeBranding,
  validateBranding,
} from './branding-format.js';

test('1. un branding absent donne les valeurs par défaut, sans contenu', () => {
  expect(normalizeBranding(undefined)).toEqual(DEFAULT_BRANDING);
  expect(normalizeBranding(null)).toEqual(DEFAULT_BRANDING);
  expect(hasBrandingContent(normalizeBranding(undefined))).toBe(false);
});

test('2. un branding complet est conservé tel quel', () => {
  const branding = {
    name: 'D0n',
    lines: ['twitch.tv/d0n'],
    x: 10,
    y: 80,
    nameSize: 40,
    lineSize: 20,
    color: '#C8B97A',
    opacity: 0.8,
  };
  expect(normalizeBranding(branding)).toEqual(branding);
});

test('3. une position hors canvas est ramenée dans les bornes', () => {
  expect(normalizeBranding({ x: -20, y: 300 })).toMatchObject({ x: 0, y: 100 });
});

test('4. une position non numérique retombe sur le défaut', () => {
  expect(normalizeBranding({ x: 'gauche', y: Number.NaN })).toMatchObject({
    x: DEFAULT_BRANDING.x,
    y: DEFAULT_BRANDING.y,
  });
});

test('5. les tailles hors bornes sont ramenées, pas rejetées', () => {
  expect(normalizeBranding({ nameSize: 500, lineSize: 0 })).toMatchObject({ nameSize: 96, lineSize: 8 });
});

test('6. les lignes en trop sont coupées et les textes trop longs tronqués', () => {
  const branding = normalizeBranding({
    lines: ['a', 'b', 'c', 'd', 'e', 'f'],
    name: 'x'.repeat(80),
  });
  expect(branding.lines.length).toBe(MAX_BRANDING_LINES);
  expect(branding.name.length).toBe(40);
});

test('7. les lignes vides sont retirées — une ligne blanche n’est pas un réseau social', () => {
  expect(normalizeBranding({ lines: ['twitch.tv/d0n', '', '   '] }).lines).toEqual(['twitch.tv/d0n']);
});

test('8. une valeur non textuelle dans les lignes est ignorée', () => {
  expect(normalizeBranding({ lines: ['ok', 42, null, { a: 1 }] }).lines).toEqual(['ok']);
});

test('9. l’opacité est bornée à [0, 1]', () => {
  expect(normalizeBranding({ opacity: 5 }).opacity).toBe(1);
  expect(normalizeBranding({ opacity: -1 }).opacity).toBe(0);
});

test('10. normaliser ne mute jamais l’entrée', () => {
  const input = { name: 'D0n', lines: ['a', ''], x: -5 };
  const snapshot = JSON.stringify(input);
  normalizeBranding(input);
  expect(JSON.stringify(input)).toBe(snapshot);
});

test('11. du contenu existe dès qu’un pseudo ou une ligne est renseigné', () => {
  expect(hasBrandingContent(normalizeBranding({ name: 'D0n' }))).toBe(true);
  expect(hasBrandingContent(normalizeBranding({ lines: ['@mozaik'] }))).toBe(true);
  expect(hasBrandingContent(normalizeBranding({ name: '   ' }))).toBe(false);
});

test('12. la position devient des pourcentages CSS', () => {
  const styles = brandingStyles({ ...DEFAULT_BRANDING, x: 25, y: 40 });
  expect(styles.left).toBe('25%');
  expect(styles.top).toBe('40%');
});

test('13. dans la moitié gauche et haute, le bloc n’est pas translaté', () => {
  const styles = brandingStyles({ ...DEFAULT_BRANDING, x: 10, y: 10 });
  expect(styles.transform).toBe('translate(0, 0)');
  expect(styles.textAlign).toBe('left');
});

test('14. posé à droite, le bloc s’aligne à droite pour ne pas déborder', () => {
  const styles = brandingStyles({ ...DEFAULT_BRANDING, x: 90, y: 10 });
  expect(styles.transform).toBe('translate(-100%, 0)');
  expect(styles.textAlign).toBe('right');
});

test('15. posé en bas, le bloc remonte au-dessus de son point d’ancrage', () => {
  expect(brandingStyles({ ...DEFAULT_BRANDING, x: 10, y: 90 }).transform).toBe('translate(0, -100%)');
  expect(brandingStyles({ ...DEFAULT_BRANDING, x: 90, y: 90 }).transform).toBe('translate(-100%, -100%)');
});

test('16. la couleur et l’opacité réglées sont reportées telles quelles', () => {
  const styles = brandingStyles({ ...DEFAULT_BRANDING, color: 'var(--color-gold)', opacity: 0.5 });
  expect(styles.color).toBe('var(--color-gold)');
  expect(styles.opacity).toBe('0.5');
});

test('17. un branding valide est accepté ; un branding absent aussi', () => {
  expect(validateBranding(undefined)).toEqual({ ok: true, errors: [] });
  expect(validateBranding({ name: 'D0n', lines: ['@mozaik'], x: 3, y: 92 })).toEqual({ ok: true, errors: [] });
});

test('18. la validation refuse ce que la normalisation corrigerait', () => {
  expect(validateBranding('D0n').ok).toBe(false);
  expect(validateBranding({ x: 150 }).ok).toBe(false);
  expect(validateBranding({ lines: 'twitch' }).ok).toBe(false);
  expect(validateBranding({ opacity: 2 }).ok).toBe(false);
  expect(validateBranding({ nameSize: 500 }).ok).toBe(false);
});

test('19. toutes les erreurs sont listées, pas seulement la première', () => {
  const result = validateBranding({ x: 150, y: -3, opacity: 9 });
  expect(result.errors.length).toBe(3);
});
