import { describe, expect, test } from 'bun:test';
import {
  BINDING_SOURCES, BINDING_TARGETS, MAX_BINDINGS, bindingErrors, canonicalBindings, createBinding, evaluateBindings, isContinuousSource, recordPulse, usesAudio,
} from './layer-bindings.js';
import { canonicalSceneDoc, createLayer, validateSceneDoc, withoutLook } from './scene-doc.js';

const run = (bindings, { levels = null, pulses = new Map(), time = 0, dt = 0.016, memory = [] } = {}) => evaluateBindings(bindings, { levels, pulses, time, dt, memory });
const silent = { level: 0, bass: 0, mid: 0, treble: 0 };

describe('sources et valeurs liées', () => {
  test('le son est continu, les alertes sont des impulsions', () => {
    for (const id of ['audio', 'bass', 'mid', 'treble']) expect(isContinuousSource(id)).toBe(true);
    for (const id of ['event:any', 'event:follow', 'event:sub', 'event:raid', 'event:bits']) expect(isContinuousSource(id)).toBe(false);
    expect(isContinuousSource('inconnue')).toBe(false);
    expect(BINDING_SOURCES.length).toBe(9);
  });

  test('une liaison neuve part de valeurs utilisables : bornes de la cible, durée selon la famille de source', () => {
    expect(createBinding('audio', 'scale')).toEqual({ source: 'audio', target: 'scale', from: 1, to: 1.25, durationMs: 120 });
    expect(createBinding('event:raid', 'opacity')).toEqual({ source: 'event:raid', target: 'opacity', from: 0, to: 1, durationMs: 800 });
    for (const [target, range] of Object.entries(BINDING_TARGETS)) {
      const binding = createBinding('audio', target);
      expect(binding.from).toBeGreaterThanOrEqual(range.min);
      expect(binding.to).toBeLessThanOrEqual(range.max);
    }
  });
});

describe('validation', () => {
  const good = { source: 'audio', target: 'scale', from: 1, to: 1.3, durationMs: 100 };

  test('une liste valide, ou absente, n’a aucun défaut', () => {
    expect(bindingErrors('b', undefined)).toEqual([]);
    expect(bindingErrors('b', [])).toEqual([]);
    expect(bindingErrors('b', [good, { ...good, target: 'opacity', from: 0, to: 1 }])).toEqual([]);
  });

  test('refuse ce qui n’est pas une liste, trop de liaisons, une source ou une cible inconnue, un nombre qui n’en est pas un', () => {
    expect(bindingErrors('b', 'non')[0]).toContain('liste attendue');
    expect(bindingErrors('b', new Array(MAX_BINDINGS + 1).fill(good))[0]).toContain('au plus');
    expect(bindingErrors('b', [{ ...good, source: 'micro' }])[0]).toContain('source');
    expect(bindingErrors('b', [{ ...good, target: 'couleur' }])[0]).toContain('valeur liée inconnue');
    expect(bindingErrors('b', [{ ...good, from: 'x' }])[0]).toContain('from');
    expect(bindingErrors('b', [{ ...good, durationMs: null }])[0]).toContain('durationMs');
    expect(bindingErrors('b', [null])[0]).toContain('objet attendu');
  });

  test('une valeur ne peut être pilotée que par une liaison', () => {
    expect(bindingErrors('b', [good, { ...good, source: 'bass' }])[0]).toContain('déjà piloté');
  });

  test('canonicalBindings ramène chaque valeur dans les bornes de sa cible, retire une liste vide', () => {
    expect(canonicalBindings([])).toBeUndefined();
    expect(canonicalBindings([{ ...good, from: -5, to: 99, durationMs: 99999 }])).toEqual([{ ...good, from: 0.1, to: 3, durationMs: 10000 }]);
    expect(canonicalBindings([{ source: 'audio', target: 'opacity', from: -1, to: 4, durationMs: -5 }])).toEqual([{ source: 'audio', target: 'opacity', from: 0, to: 1, durationMs: 0 }]);
    expect(canonicalBindings('x')).toBe('x');
  });
});

describe('dans le document de scène', () => {
  const scene = (bindings) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind: 'text', options: {}, bindings })] });
  const good = [{ source: 'event:raid', target: 'opacity', from: 0, to: 1, durationMs: 600 }];

  test('une couche porte ses liaisons, la scène reste valide', () => {
    expect(validateSceneDoc(scene(good)).ok).toBe(true);
    expect(validateSceneDoc(scene(undefined)).ok).toBe(true);
  });

  test('des liaisons invalides refusent la scène, avec le chemin du défaut', () => {
    const result = validateSceneDoc(scene([{ source: 'audio', target: 'zoom', from: 0, to: 1, durationMs: 1 }]));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('layers[a].bindings[0].target');
  });

  test('la forme canonique borne et retire une liste vide ; withoutLook retire les liaisons', () => {
    const canonical = canonicalSceneDoc(scene([{ source: 'audio', target: 'scale', from: 0, to: 99, durationMs: 100 }]));
    expect(canonical.layers[0].bindings[0]).toMatchObject({ from: 0.1, to: 3 });
    expect('bindings' in canonicalSceneDoc(scene([])).layers[0]).toBe(false);
    expect('bindings' in withoutLook(createLayer({ id: 'a', kind: 'text', bindings: good }))).toBe(false);
  });
});

describe('evaluateBindings : sources continues', () => {
  const scale = { source: 'audio', target: 'scale', from: 1, to: 2, durationMs: 0 };

  test('au silence, la valeur est « de » ; au niveau maximal, elle est « à »', () => {
    expect(run([scale], { levels: silent }).scale).toBe(1);
    expect(run([scale], { levels: { ...silent, level: 1 } }).scale).toBe(2);
    expect(run([scale], { levels: { ...silent, level: 0.5 } }).scale).toBe(1.5);
  });

  test('sans son du tout (micro absent), c’est le silence', () => {
    expect(run([scale], { levels: null }).scale).toBe(1);
  });

  test('chaque source lit sa bande', () => {
    const levels = { level: 0.1, bass: 0.9, mid: 0.5, treble: 0.3 };
    const read = (source) => run([{ ...scale, source, from: 0, to: 1, target: 'opacity' }], { levels }).opacity;
    expect(read('audio')).toBeCloseTo(0.1);
    expect(read('bass')).toBeCloseTo(0.9);
    expect(read('mid')).toBeCloseTo(0.5);
    expect(read('treble')).toBeCloseTo(0.3);
  });

  test('le lissage rapproche la valeur du niveau sans l’atteindre d’un coup, et c’est le temps qui compte, pas le nombre d’images', () => {
    const smooth = { ...scale, durationMs: 100, from: 0, to: 1, target: 'opacity' };
    const memory = [];
    const first = run([smooth], { levels: { ...silent, level: 1 }, memory, dt: 0.05 }).opacity;
    expect(first).toBeGreaterThan(0.3);
    expect(first).toBeLessThan(0.5);
    const second = run([smooth], { levels: { ...silent, level: 1 }, memory, dt: 0.05 }).opacity;
    expect(second).toBeGreaterThan(first);
    const oneStep = run([smooth], { levels: { ...silent, level: 1 }, memory: [], dt: 0.1 }).opacity;
    expect(oneStep).toBeCloseTo(second, 6);
  });

  test('une valeur de niveau aberrante est bornée', () => {
    expect(run([scale], { levels: { ...silent, level: 7 } }).scale).toBe(2);
    expect(run([scale], { levels: { ...silent, level: Number.NaN } }).scale).toBe(1);
  });
});

describe('evaluateBindings : impulsions', () => {
  const pulse = { source: 'event:raid', target: 'opacity', from: 0, to: 1, durationMs: 1000 };

  test('sans alerte, la valeur est « de »', () => {
    expect(run([pulse]).opacity).toBe(0);
  });

  test('à l’alerte, la valeur saute à « à », puis retombe en ralentissant jusqu’à « de » à la fin de la durée', () => {
    const pulses = new Map([['event:raid', 10]]);
    const at = (time) => run([pulse], { pulses, time }).opacity;
    expect(at(10)).toBe(1);
    expect(at(10.5)).toBeCloseTo(0.25, 6);
    expect(at(10.9)).toBeCloseTo(0.01, 6);
    expect(at(11)).toBe(0);
    expect(at(30)).toBe(0);
    expect(at(10.2)).toBeGreaterThan(at(10.4));
  });

  test('seule la source de ce type d’alerte compte ; « toute alerte » les prend toutes', () => {
    const pulses = new Map();
    recordPulse(pulses, 'follow', 5);
    expect(run([pulse], { pulses, time: 5 }).opacity).toBe(0);
    expect(run([{ ...pulse, source: 'event:follow' }], { pulses, time: 5 }).opacity).toBe(1);
    expect(run([{ ...pulse, source: 'event:any' }], { pulses, time: 5 }).opacity).toBe(1);
  });

  test('une nouvelle alerte relance l’impulsion', () => {
    const pulses = new Map([['event:raid', 0]]);
    expect(run([pulse], { pulses, time: 0.9 }).opacity).toBeLessThan(0.02);
    recordPulse(pulses, 'raid', 0.9);
    expect(run([pulse], { pulses, time: 0.9 }).opacity).toBe(1);
  });

  test('une durée nulle ne produit pas d’impulsion, sans diviser par zéro', () => {
    expect(run([{ ...pulse, durationMs: 0 }], { pulses: new Map([['event:raid', 1]]), time: 1 }).opacity).toBe(0);
  });

  test('« de » et « à » peuvent être inversés : l’opacité peut chuter à l’alerte', () => {
    expect(run([{ ...pulse, from: 1, to: 0 }], { pulses: new Map([['event:raid', 2]]), time: 2 }).opacity).toBe(0);
    expect(run([{ ...pulse, from: 1, to: 0 }]).opacity).toBe(1);
  });
});

describe('usesAudio', () => {
  test('vrai si une liaison est continue', () => {
    expect(usesAudio([{ source: 'bass', target: 'scale', from: 1, to: 2, durationMs: 1 }])).toBe(true);
    expect(usesAudio([{ source: 'event:raid', target: 'scale', from: 1, to: 2, durationMs: 1 }])).toBe(false);
    expect(usesAudio(undefined)).toBe(false);
    expect(usesAudio([])).toBe(false);
  });
});

describe('édition d’une liste de liaisons', () => {
  const { addBinding, removeBinding, changeBinding } = require('./layer-bindings.js');

  test('ajouter prend la première valeur libre, de la plus parlante à la moins parlante, jusqu’à la limite', () => {
    let list = [];
    const targets = [];
    for (let step = 0; step < MAX_BINDINGS; step += 1) {
      list = addBinding(list);
      targets.push(list.at(-1).target);
    }
    expect(targets).toEqual(['scale', 'opacity', 'rotation', 'blur']);
    expect(addBinding(list)).toBeNull();
    expect(list.every((binding) => binding.source === 'audio')).toBe(true);
  });

  test('une valeur retirée redevient libre', () => {
    const list = addBinding(addBinding([]));
    const fewer = removeBinding(list, 0);
    expect(fewer.map((binding) => binding.target)).toEqual(['opacity']);
    expect(addBinding(fewer).at(-1).target).toBe('scale');
  });

  test('changer la valeur liée remet de et à aux valeurs de départ de la nouvelle valeur', () => {
    const list = [{ source: 'audio', target: 'scale', from: 1.1, to: 1.9, durationMs: 50 }];
    expect(changeBinding(list, 0, 'target', 'rotation')[0]).toMatchObject({ target: 'rotation', from: 0, to: 15, durationMs: 50 });
  });

  test('une valeur déjà pilotée par une autre liaison est refusée', () => {
    const list = addBinding(addBinding([]));
    expect(changeBinding(list, 1, 'target', 'scale')).toEqual(list);
  });

  test('passer du son à une alerte (ou l’inverse) change la durée de départ, passer d’une alerte à une autre non', () => {
    const list = [{ source: 'audio', target: 'scale', from: 1, to: 2, durationMs: 120 }];
    const pulse = changeBinding(list, 0, 'source', 'event:raid');
    expect(pulse[0].durationMs).toBe(800);
    expect(changeBinding([{ ...pulse[0], durationMs: 300 }], 0, 'source', 'event:sub')[0].durationMs).toBe(300);
    expect(changeBinding(pulse, 0, 'source', 'bass')[0].durationMs).toBe(120);
  });

  test('un nombre se règle ; une valeur qui n’en est pas un, un champ inconnu ou un index absent laissent la liste intacte, sans la modifier', () => {
    const list = [{ source: 'audio', target: 'scale', from: 1, to: 2, durationMs: 120 }];
    expect(changeBinding(list, 0, 'to', 1.5)[0].to).toBe(1.5);
    expect(list[0].to).toBe(2);
    expect(changeBinding(list, 0, 'to', Number.NaN)).toEqual(list);
    expect(changeBinding(list, 0, 'target', 'couleur')).toEqual(list);
    expect(changeBinding(list, 5, 'to', 1)).toEqual(list);
  });
});

describe('evaluateBindings : le repos est exact', () => {
  test('un son qui s’éteint rejoint exactement le repos en un temps fini (aucune réécriture sans fin)', () => {
    const binding = { source: 'audio', target: 'opacity', from: 0, to: 1, durationMs: 120 };
    const memory = [];
    run([binding], { levels: { ...silent, level: 1 }, memory, dt: 0.5 });
    let frames = 0;
    let value = 1;
    while (value !== 0 && frames < 2000) {
      value = run([binding], { levels: silent, memory, dt: 0.016 }).opacity;
      frames += 1;
    }
    expect(value).toBe(0);
    expect(frames).toBeLessThan(400);
  });

  test('la fin d’une impulsion vaut exactement « de »', () => {
    const binding = { source: 'event:raid', target: 'opacity', from: 0.2, to: 1, durationMs: 500 };
    expect(run([binding], { pulses: new Map([['event:raid', 0]]), time: 0.5 }).opacity).toBe(0.2);
    expect(run([binding], { pulses: new Map([['event:raid', 0]]), time: 0.4999 }).opacity).toBeGreaterThan(0.2);
  });
});
