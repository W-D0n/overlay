import { describe, expect, test } from 'bun:test';
import { createLayer } from './scene-doc.js';
import { LEVELS_FRESH_SECONDS, drivenFilters, lookAt, lookStyles, paramValues, percent, valuesAt } from './layer-look.js';

const layer = (over = {}) => ({ ...createLayer({ id: 'a', kind: 'rain' }), ...over });
const loud = { level: 1, bass: 1, mid: 1, treble: 1 };
const instant = (over = {}) => ({ timelineMs: 0, levels: null, levelsAt: 0, pulses: new Map(), time: 0, dt: 0.016, ...over });
const audioScale = { source: 'audio', target: 'scale', from: 1, to: 2, durationMs: 0 };

describe('valuesAt', () => {
  test('sans timeline ni liaison, aucune valeur animée', () => {
    expect(valuesAt(layer(), [], instant())).toEqual({});
  });

  test('la timeline donne la valeur de l’instant de lecture', () => {
    const timeline = [{ target: 'opacity', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 1, ease: 'linear' }] }];
    expect(valuesAt(layer({ timeline }), [], instant({ timelineMs: 500 })).opacity).toBeCloseTo(0.5, 5);
    expect(valuesAt(layer({ timeline }), [], instant({ timelineMs: 0 })).opacity).toBe(0);
  });

  test('un niveau reste le niveau vivant une demi-seconde exactement', () => {
    const bound = layer({ bindings: [audioScale] });
    expect(valuesAt(bound, [], instant({ levels: loud, levelsAt: 0, time: 0.49 })).scale).toBeCloseTo(2, 5);
    expect(valuesAt(bound, [], instant({ levels: loud, levelsAt: 0, time: 0.5 })).scale).toBeCloseTo(1, 5);
    expect(LEVELS_FRESH_SECONDS).toBe(0.5);
  });

  test('une liaison audio suit le niveau tant qu’il est frais, et vaut le silence ensuite', () => {
    const bound = layer({ bindings: [audioScale] });
    const fresh = valuesAt(bound, [], instant({ levels: loud, levelsAt: 10, time: 10 + LEVELS_FRESH_SECONDS - 0.01 }));
    const stale = valuesAt(bound, [], instant({ levels: loud, levelsAt: 10, time: 10 + LEVELS_FRESH_SECONDS }));
    expect(fresh.scale).toBeCloseTo(2, 5);
    expect(stale.scale).toBeCloseTo(1, 5);
  });

  test('une liaison l’emporte sur la timeline pour la même valeur', () => {
    const timeline = [{ target: 'scale', keys: [{ t: 0, v: 5, ease: 'linear' }] }];
    const both = layer({ timeline, bindings: [audioScale] });
    expect(valuesAt(both, [], instant({ levels: loud, levelsAt: 0, time: 0 })).scale).toBeCloseTo(2, 5);
    expect(valuesAt(layer({ timeline, bindings: [] }), [], instant()).scale).toBe(5);
  });
});

describe('lookAt', () => {
  test('sans animation, les valeurs liées passent telles quelles', () => {
    const bound = { opacity: 0.3 };
    expect(lookAt(layer(), 100, null, bound)).toBe(bound);
  });

  test('les valeurs liées que l’animation ne règle pas (réglages, filtres) traversent la couche animée', () => {
    const animated = layer({ animation: { enter: { preset: 'fade', durationMs: 1000 } } });
    expect(lookAt(animated, 100, null, { 'param:size': 4, 'filter:glow': 0.5 })).toMatchObject({ 'param:size': 4, 'filter:glow': 0.5 });
  });

  test('une entrée en fondu part de zéro et finit à l’opacité de la couche ; les valeurs liées restent', () => {
    const animated = layer({ animation: { enter: { preset: 'fade', durationMs: 1000 } } });
    expect(lookAt(animated, 0, null, { x: 3 })).toMatchObject({ opacity: 0, x: 3, gone: false });
    expect(lookAt(animated, 2000, null, {}).opacity).toBe(1);
    expect(lookAt(animated, 500, null, {}).opacity).toBeCloseTo(0.5, 1);
  });

  test('une sortie finie marque la couche comme partie', () => {
    const animated = layer({ animation: { exit: { preset: 'fade', durationMs: 500, onLeave: true } } });
    expect(lookAt(animated, 100, null, {}).gone).toBe(false);
    expect(lookAt(animated, 2000, 100, {}).gone).toBe(true);
  });
});

describe('paramValues', () => {
  test('ne garde que les réglages pilotés, sans leur préfixe', () => {
    expect(paramValues({ opacity: 1, 'param:size': 4, 'param:speed': 0.5, 'filter:glow': 2 })).toEqual({ size: 4, speed: 0.5 });
    expect(paramValues({})).toEqual({});
    expect(paramValues({ opacity: 1 })).toEqual({});
  });

  test('une valeur indéfinie est ignorée', () => {
    expect(paramValues({ 'param:size': undefined })).toStrictEqual({});
  });
});

describe('percent', () => {
  test('une fraction devient un pourcentage à quatre décimales au plus', () => {
    expect(percent(0.5)).toBe('50%');
    expect(percent(0)).toBe('0%');
    expect(percent(1 / 3)).toBe('33.3333%');
  });
});

describe('drivenFilters', () => {
  const filters = { brightness: 1.2, glow: { color: '#ffffff', size: 10, intensity: 0.2 } };

  test('sans valeur de filtre pilotée, les filtres de la couche sont rendus tels quels', () => {
    expect(drivenFilters(layer({ filters }), { opacity: 1, 'param:size': 2 })).toBe(filters);
    expect(drivenFilters(layer(), {})).toBeUndefined();
  });

  test('une valeur de halo pilotée remplace l’intensité du halo et garde les réglages de couleur', () => {
    const driven = drivenFilters(layer({ filters }), { 'filter:glow': 0.7 });
    expect(driven).toMatchObject({ brightness: 1.2, glow: { color: '#ffffff', size: 10, intensity: 0.7 } });
    expect(filters.glow.intensity).toBe(0.2);
  });
});

describe('lookStyles', () => {
  test('une couche au repos n’écrit que son opacité : le reste est vide, le style inline disparaît', () => {
    expect(lookStyles(layer({ opacity: 0.8 }))).toEqual({ display: '', opacity: '0.8', mixBlendMode: '', transform: '', clipPath: '', filter: '', maskImage: expect.any(String), maskComposite: expect.any(String) });
    expect(lookStyles(layer()).maskImage).toBe('');
  });

  test('l’affichage disparaît quand la couche est partie', () => {
    expect(lookStyles(layer(), { gone: true }).display).toBe('none');
    expect(lookStyles(layer(), { gone: false }).display).toBe('');
  });

  test('l’opacité liée remplace celle de la couche, arrondie à quatre décimales', () => {
    expect(lookStyles(layer({ opacity: 0.8 }), { opacity: 0.123456 }).opacity).toBe('0.1235');
    expect(lookStyles(layer({ opacity: 0.8 }), { opacity: 0 }).opacity).toBe('0');
  });

  test('la fusion « normal » n’écrit rien, une autre fusion s’écrit', () => {
    expect(lookStyles(layer({ blend: 'normal' })).mixBlendMode).toBe('');
    expect(lookStyles(layer({ blend: 'screen' })).mixBlendMode).toBe('screen');
  });

  test('la transformation compose décalage, rotation puis échelle, chacun absent s’il est neutre', () => {
    expect(lookStyles(layer({ rotation: 30 })).transform).toBe('rotate(30deg)');
    expect(lookStyles(layer(), { x: 5, y: -2 }).transform).toBe('translate(5%, -2%)');
    expect(lookStyles(layer(), { x: 0, y: 4 }).transform).toBe('translate(0%, 4%)');
    expect(lookStyles(layer(), { scale: 1.5 }).transform).toBe('scale(1.5)');
    expect(lookStyles(layer(), { scale: 1 }).transform).toBe('');
    expect(lookStyles(layer({ rotation: 10 }), { x: 1, y: 0, scale: 2 }).transform).toBe('translate(1%, 0%) rotate(10deg) scale(2)');
  });

  test('la rotation liée remplace celle de la couche, y compris pour la remettre à zéro', () => {
    expect(lookStyles(layer({ rotation: 30 }), { rotation: 0 }).transform).toBe('');
    expect(lookStyles(layer({ rotation: 30 }), { rotation: 45 }).transform).toBe('rotate(45deg)');
  });

  test('le flou se compte en pixels de référence, lié ou non', () => {
    expect(lookStyles(layer({ blur: 4 })).filter).toBe('blur(calc(var(--reference-scale, 1) * 4px))');
    expect(lookStyles(layer({ blur: 4 }), { blur: 0 }).filter).toBe('');
    expect(lookStyles(layer(), { blur: 2.5 }).filter).toBe('blur(calc(var(--reference-scale, 1) * 2.5px))');
  });

  test('le rognage s’écrit en inset, la révélation d’une animation s’ajoute à lui et le tout se borne à 100 %', () => {
    expect(lookStyles(layer({ crop: { top: 0.1, right: 0, bottom: 0.2, left: 0 } })).clipPath).toBe('inset(10% 0% 20% 0%)');
    expect(lookStyles(layer(), { reveal: { top: 0, right: 0.5, bottom: 0, left: 0 } }).clipPath).toBe('inset(0% 50% 0% 0%)');
    expect(lookStyles(layer({ crop: { top: 0.2, right: 0, bottom: 0, left: 0 } }), { reveal: { top: 0.3, right: 0, bottom: 0, left: 0 } }).clipPath).toBe('inset(50% 0% 0% 0%)');
    expect(lookStyles(layer({ crop: { top: 0.8, right: 0, bottom: 0, left: 0 } }), { reveal: { top: 0.8, right: 0, bottom: 0, left: 0 } }).clipPath).toBe('inset(100% 0% 0% 0%)');
    expect(lookStyles(layer(), { reveal: { top: 0, right: 0, bottom: 0, left: 0 } }).clipPath).toBe('');
  });

  test('les valeurs de filtre pilotées passent dans le filtre du calque', () => {
    const filters = { glow: { color: '#ffffff', size: 10, intensity: 0.2 } };
    expect(lookStyles(layer({ filters })).filter).toContain('rgba(255, 255, 255, 0.2)');
    expect(lookStyles(layer({ filters }), { 'filter:glow': 0.7 }).filter).toContain('rgba(255, 255, 255, 0.7)');
  });

  test('le flou garde trois décimales', () => {
    expect(lookStyles(layer({ blur: 2.5551 })).filter).toBe('blur(calc(var(--reference-scale, 1) * 2.555px))');
  });

  test('un masque rectangle combine ses deux dégradés (intersection, ou addition inversé) ; un masque linéaire n’en combine pas', () => {
    const rectangle = { shape: 'rectangle', x: 0.1, y: 0.2, width: 0.5, height: 0.4, feather: 0 };
    expect(lookStyles(layer({ mask: rectangle })).maskComposite).toBe('intersect');
    expect(lookStyles(layer({ mask: { ...rectangle, invert: true } })).maskComposite).toBe('add');
    expect(lookStyles(layer({ mask: { shape: 'linear', angle: 90, start: 0.4, end: 0.6 } })).maskComposite).toBe('');
  });

  test('le masque de la couche donne une image de masque', () => {
    const masked = lookStyles(layer({ mask: { shape: 'linear', angle: 90, start: 0.4, end: 0.6 } }));
    expect(masked.maskImage).not.toBe('');
  });
});
