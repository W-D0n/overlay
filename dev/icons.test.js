import { describe, expect, test } from 'bun:test';
import { ICON_NAMES, icon, setIcon } from './icons.js';

/** Un bouton factice qui compte les écritures de son contenu. */
function fakeButton() {
  const writes = [];
  return {
    dataset: {},
    writes,
    set innerHTML(value) { writes.push(value); },
  };
}

describe('icon', () => {
  test('chaque icône est un SVG décoratif en trait, non focalisable', () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain('viewBox="0 0 16 16"');
    }
  });

  test('la poignée est pleine, les autres sont en trait', () => {
    expect(icon('grip')).toContain('fill="currentColor"');
    expect(icon('eye')).toContain('stroke="currentColor"');
  });
});

describe('setIcon', () => {
  test('écrit l’icône une fois ; la même icône redemandée ne réécrit rien (le nœud enfoncé doit survivre)', () => {
    const button = fakeButton();
    setIcon(button, 'eye');
    setIcon(button, 'eye');
    setIcon(button, 'eye');
    expect(button.writes).toEqual([icon('eye')]);
  });

  test('une autre icône la remplace', () => {
    const button = fakeButton();
    setIcon(button, 'eye');
    setIcon(button, 'eye-off');
    setIcon(button, 'eye');
    expect(button.writes).toEqual([icon('eye'), icon('eye-off'), icon('eye')]);
  });
});
