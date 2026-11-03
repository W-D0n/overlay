import { describe, expect, test } from 'bun:test';
import {
  AFTER_LIMITS, ANIMATION_EASES, LOOPS, PRESETS, animationErrors, applyPose, canonicalAnimation, evaluateAnimation, leaveDelayMs, restartsAnimationOn,
} from './layer-animation.js';
import { canonicalSceneDoc, createLayer, currentFromScene, validateSceneDoc, withoutLook } from './scene-doc.js';

const enter = (preset = 'fade', durationMs = 1000, extra = {}) => ({ preset, durationMs, ...extra });
const exit = (preset = 'fade', durationMs = 1000, extra = {}) => ({ preset, durationMs, ...extra });
const at = (animation, elapsedMs, leftAtMs = null) => evaluateAnimation(animation, elapsedMs, leftAtMs);
const REST = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, blur: 0, reveal: { top: 0, right: 0, bottom: 0, left: 0 } };
const invisible = (pose) => pose.opacity === 0 || Object.values(pose.reveal).some((part) => part === 1) || pose.scale === 0;

describe('préréglages', () => {
  test('chaque préréglage de calque part de la couche invisible et arrive au repos exact', () => {
    const layerPresets = PRESETS.filter(({ content }) => content === undefined);
    expect(layerPresets.length).toBe(14);
    for (const preset of layerPresets) {
      expect(invisible(preset.pose(0))).toBe(true);
      expect(preset.pose(1)).toEqual(REST);
    }
  });

  test('les préréglages de texte laissent le calque au repos : c\'est le texte qui se dévoile', () => {
    const contentPresets = PRESETS.filter(({ content }) => content !== undefined);
    expect(contentPresets.map(({ id }) => id)).toEqual(['type', 'letters', 'words', 'draw']);
    for (const preset of contentPresets) {
      expect(preset.pose(0)).toEqual(REST);
      expect(preset.pose(0.5)).toEqual(REST);
    }
    expect(contentPresets.map(({ content }) => content)).toEqual([{ kind: 'text', unit: 'chars', reveal: 'hard' }, { kind: 'text', unit: 'chars', reveal: 'soft' }, { kind: 'text', unit: 'words', reveal: 'soft' }, { kind: 'shape' }]);
  });

  test('chaque préréglage a un identifiant et un libellé uniques, une courbe permise', () => {
    expect(new Set(PRESETS.map(({ id }) => id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map(({ label }) => label)).size).toBe(PRESETS.length);
    for (const { ease } of PRESETS) expect(ANIMATION_EASES.some(({ id }) => id === ease)).toBe(true);
    expect(ANIMATION_EASES.some(({ id }) => id === 'hold')).toBe(false);
  });

  test('les glissements viennent du côté nommé, les révélations masquent le côté opposé à leur sens', () => {
    const half = (id) => PRESETS.find((preset) => preset.id === id).pose(0.5);
    expect(half('slide-bottom').y).toBeGreaterThan(0);
    expect(half('slide-top').y).toBeLessThan(0);
    expect(half('slide-right').x).toBeGreaterThan(0);
    expect(half('slide-left').x).toBeLessThan(0);
    expect(half('wipe-right').reveal).toEqual({ top: 0, right: 0.5, bottom: 0, left: 0 });
    expect(half('wipe-left').reveal.left).toBe(0.5);
    expect(half('wipe-down').reveal.bottom).toBe(0.5);
    expect(half('wipe-up').reveal.top).toBe(0.5);
  });

  test('le rebond dépasse sa taille de repos avant de s\'y poser', () => {
    const bounce = PRESETS.find(({ id }) => id === 'bounce');
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((p) => bounce.pose(p).scale))).toBeGreaterThan(1);
  });

  test('le glitch est une fonction de l\'avancement seul : rejoué, il redonne la même chose', () => {
    const glitch = PRESETS.find(({ id }) => id === 'glitch');
    expect(glitch.pose(0.4)).toEqual(glitch.pose(0.4));
    expect(glitch.pose(0.4).x).not.toBe(0);
  });
});

describe('boucles', () => {
  test('une boucle revient au même point à chaque tour et reste proche du repos', () => {
    expect(LOOPS.map(({ id }) => id)).toEqual(['float', 'pulse', 'sway', 'blink', 'shake']);
    for (const loop of LOOPS) {
      for (const phase of [0, 0.13, 0.5, 0.77]) {
        const first = loop.pose(phase, 1);
        const next = loop.pose(phase + 3, 1);
        for (const key of ['opacity', 'x', 'y', 'scale', 'rotation']) expect(next[key]).toBeCloseTo(first[key], 9);
        expect(first.opacity).toBeGreaterThanOrEqual(0);
        expect(first.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  test('l\'amplitude est proportionnelle, le clignotement ne descend jamais sous zéro', () => {
    const sway = LOOPS.find(({ id }) => id === 'sway');
    expect(sway.pose(0.25, 2).rotation).toBeCloseTo(2 * sway.pose(0.25, 1).rotation, 9);
    const blink = LOOPS.find(({ id }) => id === 'blink');
    for (let phase = 0; phase <= 1; phase += 0.05) expect(blink.pose(phase, 2).opacity).toBeGreaterThanOrEqual(0);
  });
});

describe('validation', () => {
  const errors = (animation) => animationErrors('a', animation);

  test('une animation absente ou bien formée est valide', () => {
    expect(errors(undefined)).toEqual([]);
    expect(errors({})).toEqual([]);
    expect(errors({
      enter: enter('zoom', 600, { delayMs: 200, ease: 'easeIn' }),
      loop: { preset: 'float', periodMs: 3000, amount: 1.5 },
      exit: exit('fade', 400, { afterMs: 8000, onLeave: true }),
      restartOn: ['event:raid'],
    })).toEqual([]);
  });

  test('chaque défaut est signalé avec son chemin', () => {
    expect(errors('x')).toEqual(['a : objet attendu']);
    expect(errors({ enter: 'x' })).toEqual(['a.enter : objet attendu']);
    expect(errors({ enter: { preset: 'nope', durationMs: 100 } })).toEqual(['a.enter.preset : préréglage inconnu']);
    expect(errors({ enter: { preset: 'fade' } })).toEqual(['a.enter.durationMs : nombre attendu']);
    expect(errors({ enter: enter('fade', 10) })[0]).toContain('a.enter.durationMs : entre 50 et 60000');
    expect(errors({ enter: enter('fade', 100, { delayMs: -1 }) })[0]).toContain('a.enter.delayMs');
    expect(errors({ enter: enter('fade', 100, { ease: 'hold' }) })).toEqual(['a.enter.ease : courbe inconnue']);
    expect(errors({ loop: 'x' })).toEqual(['a.loop : objet attendu']);
    expect(errors({ loop: { preset: 'nope', periodMs: 1000 } })).toEqual(['a.loop.preset : boucle inconnue']);
    expect(errors({ loop: { preset: 'float', periodMs: 10 } })[0]).toContain('a.loop.periodMs');
    expect(errors({ loop: { preset: 'float', periodMs: 1000, amount: 5 } })[0]).toContain('a.loop.amount');
    expect(errors({ exit: 'x' })).toEqual(['a.exit : objet attendu']);
    expect(errors({ exit: exit('nope', 100, { onLeave: true }) })).toEqual(['a.exit.preset : préréglage inconnu']);
    expect(errors({ exit: exit('fade', 100, { afterMs: AFTER_LIMITS.max + 1 }) })[0]).toContain('a.exit.afterMs');
    expect(errors({ exit: exit('fade', 100, { onLeave: 'oui' }) })).toEqual(['a.exit.onLeave : booléen attendu', 'a.exit : un instant (afterMs) ou le départ de la scène (onLeave) est attendu']);
    expect(errors({ exit: exit('fade', 100, { afterMs: 10, ease: 'hold' }) })).toEqual(['a.exit.ease : courbe inconnue']);
  });

  test('une sortie sans déclencheur est refusée, avec l\'un des deux elle est valide', () => {
    expect(errors({ exit: exit('fade', 100) })).toEqual(['a.exit : un instant (afterMs) ou le départ de la scène (onLeave) est attendu']);
    expect(errors({ exit: exit('fade', 100, { onLeave: false }) }).length).toBe(1);
    expect(errors({ exit: exit('fade', 100, { afterMs: 0 }) })).toEqual([]);
    expect(errors({ exit: exit('fade', 100, { onLeave: true }) })).toEqual([]);
  });

  test('les alertes de relance sont connues, une fois chacune, en liste', () => {
    expect(errors({ restartOn: 'event:raid' })).toEqual(['a.restartOn : liste attendue']);
    expect(errors({ restartOn: ['event:nope'] })).toEqual(['a.restartOn : alerte inconnue']);
    expect(errors({ restartOn: ['event:raid', 'event:raid'] })).toEqual(['a.restartOn : une alerte ne figure qu\'une fois']);
  });
});

describe('forme canonique', () => {
  test('les durées sont arrondies et bornées, les valeurs par défaut ne sont pas écrites', () => {
    expect(canonicalAnimation({
      enter: enter('fade', 12.6, { delayMs: 0, ease: 'easeInOut' }),
      loop: { preset: 'float', periodMs: 99999, amount: 1 },
      exit: exit('zoom', 99999, { afterMs: 99_000_000.4, onLeave: false, ease: 'easeOut' }),
    })).toEqual({
      enter: { preset: 'fade', durationMs: 50 },
      loop: { preset: 'float', periodMs: 60000 },
      exit: { preset: 'zoom', durationMs: 60000, afterMs: AFTER_LIMITS.max },
    });
  });

  test('une valeur choisie qui n\'est pas celle par défaut est gardée', () => {
    expect(canonicalAnimation({
      enter: enter('fade', 500, { delayMs: 250.4, ease: 'linear' }),
      loop: { preset: 'pulse', periodMs: 2000, amount: 1.456 },
      exit: exit('fade', 300, { onLeave: true, ease: 'linear' }),
    })).toEqual({
      enter: { preset: 'fade', durationMs: 500, delayMs: 250, ease: 'linear' },
      loop: { preset: 'pulse', periodMs: 2000, amount: 1.46 },
      exit: { preset: 'fade', durationMs: 300, onLeave: true, ease: 'linear' },
    });
    expect(canonicalAnimation({ loop: { preset: 'float', periodMs: 1000, amount: 0.001 } }).loop.amount).toBe(0.1);
    expect(canonicalAnimation({ loop: { preset: 'float', periodMs: 1000, amount: 99 } }).loop.amount).toBe(2);
  });

  test('les alertes de relance suivent l\'ordre des sources, sans doublon', () => {
    const canonical = canonicalAnimation({ enter: enter(), restartOn: ['event:bits', 'event:raid', 'event:any'] });
    expect(canonical.restartOn).toEqual(['event:any', 'event:raid', 'event:bits']);
    expect(canonicalAnimation({ enter: enter(), restartOn: ['event:any', 'event:raid', 'event:bits'] }).restartOn).toEqual(['event:any', 'event:raid', 'event:bits']);
  });

  test('une liste de relance vide, ou sans rien à relancer, n\'est pas écrite ; une animation vide non plus', () => {
    expect('restartOn' in canonicalAnimation({ enter: enter(), restartOn: [] })).toBe(false);
    expect(canonicalAnimation({ restartOn: ['event:raid'] })).toBeUndefined();
    expect(canonicalAnimation({})).toBeUndefined();
    expect(canonicalAnimation({ enter: enter(), restartOn: ['event:raid'] }).restartOn).toEqual(['event:raid']);
  });

  test('ce qui n\'est pas une animation valide reste tel quel, pour que la validation le refuse', () => {
    expect(canonicalAnimation('x')).toBe('x');
    expect(canonicalAnimation(undefined)).toBeUndefined();
    expect(canonicalAnimation({ enter: 'x' })).toEqual({ enter: 'x' });
    expect(canonicalAnimation({ loop: 'x' })).toEqual({ loop: 'x' });
    expect(canonicalAnimation({ exit: 'x' })).toEqual({ exit: 'x' });
    expect(canonicalAnimation({ enter: { preset: 'fade', durationMs: 'x', delayMs: 'y' } })).toEqual({ enter: { preset: 'fade', durationMs: 'x', delayMs: 'y' } });
    expect(canonicalAnimation({ exit: { preset: 'fade', durationMs: 100, afterMs: 'x' } }).exit.afterMs).toBe('x');
    expect(canonicalAnimation({ enter: enter(), restartOn: 'x' }).restartOn).toBe('x');
    expect(canonicalAnimation({ enter: enter(), restartOn: ['nope'] }).restartOn).toEqual(['nope']);
  });
});

describe('évaluation : l\'entrée', () => {
  test('sans animation, la couche est au repos et ne disparaît jamais', () => {
    expect(at(undefined, 5000)).toEqual({ pose: REST, gone: false, content: null });
    expect(at({}, 5000)).toEqual({ pose: REST, gone: false, content: null });
  });

  test('avant le délai la couche est invisible, puis l\'entrée avance jusqu\'au repos', () => {
    const animation = { enter: enter('fade', 1000, { delayMs: 500, ease: 'linear' }) };
    expect(at(animation, 0).pose.opacity).toBe(0);
    expect(at(animation, 499).pose.opacity).toBe(0);
    expect(at(animation, 1000).pose.opacity).toBeCloseTo(0.5, 9);
    expect(at(animation, 1500).pose).toEqual(REST);
    expect(at(animation, 99_999).pose).toEqual(REST);
    expect(at(animation, 99_999).gone).toBe(false);
  });

  test('la courbe choisie s\'applique, à défaut celle du préréglage', () => {
    const linear = at({ enter: enter('fade', 1000, { ease: 'linear' }) }, 250).pose.opacity;
    const slow = at({ enter: enter('fade', 1000, { ease: 'easeIn' }) }, 250).pose.opacity;
    const dflt = at({ enter: enter('fade', 1000) }, 250).pose.opacity;
    expect(linear).toBeCloseTo(0.25, 9);
    expect(slow).toBeCloseTo(0.0625, 9);
    expect(dflt).toBeCloseTo(2 * 0.25 * 0.25, 9);
  });
});

describe('évaluation : la boucle', () => {
  const animation = { enter: enter('fade', 1000, { ease: 'linear' }), loop: { preset: 'sway', periodMs: 4000, amount: 1 } };

  test('elle ne démarre qu\'à la fin de l\'entrée, à sa phase zéro', () => {
    expect(at(animation, 999).pose.rotation).toBe(0);
    expect(at(animation, 1000).pose.rotation).toBeCloseTo(0, 9);
    expect(at(animation, 2000).pose.rotation).toBeCloseTo(3, 9);
    expect(at(animation, 3000).pose.rotation).toBeCloseTo(0, 9);
    expect(at(animation, 4000).pose.rotation).toBeCloseTo(-3, 9);
  });

  test('sans entrée elle démarre tout de suite', () => {
    expect(at({ loop: { preset: 'sway', periodMs: 4000 } }, 1000).pose.rotation).toBeCloseTo(3, 9);
  });

  test('l\'amplitude est celle demandée', () => {
    expect(at({ loop: { preset: 'sway', periodMs: 4000, amount: 2 } }, 1000).pose.rotation).toBeCloseTo(6, 9);
  });
});

describe('évaluation : la sortie', () => {
  test('à date fixe : elle démarre à l\'instant demandé, finit invisible et reste invisible', () => {
    const animation = { exit: exit('fade', 1000, { afterMs: 2000, ease: 'linear' }) };
    expect(at(animation, 1999)).toEqual({ pose: REST, gone: false, content: null });
    expect(at(animation, 2500).pose.opacity).toBeCloseTo(0.5, 9);
    expect(at(animation, 2500).gone).toBe(false);
    expect(at(animation, 3000)).toMatchObject({ gone: true });
    expect(at(animation, 3000).pose.opacity).toBe(0);
    expect(at(animation, 50_000)).toMatchObject({ gone: true });
  });

  test('au départ de la scène : sans départ elle ne joue pas, avec elle démarre à l\'instant du départ', () => {
    const animation = { exit: exit('fade', 1000, { onLeave: true, ease: 'linear' }) };
    expect(at(animation, 60_000, null)).toEqual({ pose: REST, gone: false, content: null });
    expect(at(animation, 5000, 5000).pose.opacity).toBe(1);
    expect(at(animation, 5500, 5000).pose.opacity).toBeCloseTo(0.5, 9);
    expect(at(animation, 6000, 5000).gone).toBe(true);
  });

  test('un départ de scène ne déclenche rien quand la sortie ne le demande pas', () => {
    expect(at({ exit: exit('fade', 1000, { afterMs: 9000 }) }, 5500, 5000)).toEqual({ pose: REST, gone: false, content: null });
  });

  test('les deux ensemble : la première qui arrive joue', () => {
    const animation = { exit: exit('fade', 1000, { afterMs: 8000, onLeave: true, ease: 'linear' }) };
    expect(at(animation, 4500, 4000).pose.opacity).toBeCloseTo(0.5, 9);
    expect(at(animation, 8500, 9000).pose.opacity).toBeCloseTo(0.5, 9);
    expect(at(animation, 8500, 2000).gone).toBe(true);
  });

  test('une sortie qui démarre pendant l\'entrée part de la présence atteinte, sans saut', () => {
    const animation = { enter: enter('fade', 1000, { ease: 'linear' }), exit: exit('fade', 1000, { afterMs: 400, ease: 'linear' }) };
    expect(at(animation, 400).pose.opacity).toBeCloseTo(0.4, 9);
    expect(at(animation, 900).pose.opacity).toBeCloseTo(0.2, 9);
    expect(at(animation, 1400).gone).toBe(true);
  });

  test('la sortie rejoue le préréglage choisi à l\'envers', () => {
    const animation = { exit: exit('slide-bottom', 1000, { afterMs: 0, ease: 'linear' }) };
    const pose = at(animation, 500).pose;
    expect(pose.opacity).toBeCloseTo(0.5, 9);
    expect(pose.y).toBeCloseTo(6, 9);
  });

  test("la sortie a son propre préréglage, distinct de celui de l'entrée", () => {
    const animation = { enter: enter('zoom', 500, { ease: 'linear' }), exit: exit('slide-bottom', 1000, { afterMs: 2000, ease: 'linear' }) };
    expect(at(animation, 1000).pose.scale).toBe(1);
    const pose = at(animation, 2500).pose;
    expect(pose.scale).toBe(1);
    expect(pose.y).toBeCloseTo(6, 9);
  });

  test('pendant la sortie, la boucle et la sortie se composent : opacités multipliées, masque conservé', () => {
    const blinking = { loop: { preset: 'blink', periodMs: 2000 }, exit: exit('fade', 1000, { afterMs: 1000, ease: 'linear' }) };
    expect(at(blinking, 1500).pose.opacity).toBeCloseTo(0.5 * (1 + (0.675 - 1) * 0.5), 9);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const wipe = { loop: { preset: 'float', periodMs: 2000 }, exit: exit({ top: 'wipe-up', right: 'wipe-right', bottom: 'wipe-down', left: 'wipe-left' }[side], 1000, { afterMs: 1000, ease: 'linear' }) };
      expect(at(wipe, 1500).pose.reveal[side]).toBeCloseTo(0.5, 9);
    }
  });

  test("la boucle s'éteint pendant la sortie et ne revient pas", () => {
    const animation = { loop: { preset: 'sway', periodMs: 4000 }, exit: exit('fade', 1000, { afterMs: 1000, ease: 'linear' }) };
    expect(at(animation, 1000).pose.rotation).toBeCloseTo(3, 9);
    expect(at(animation, 1500).pose.rotation).toBeCloseTo(0.5 * 3 * Math.sin(0.375 * 2 * Math.PI), 9);
    expect(at(animation, 2000).pose.rotation).toBeCloseTo(0, 9);
  });
});

describe('composition avec les valeurs de base', () => {
  const layer = { opacity: 0.8, rotation: 10, blur: 2 };

  test('sans animation les valeurs de base sont inchangées', () => {
    expect(applyPose(layer, {}, REST)).toEqual({ opacity: 0.8, rotation: 10, blur: 2, scale: 1, x: 0, y: 0, reveal: REST.reveal });
  });

  test('opacité et échelle se multiplient, décalages, rotation et flou s\'ajoutent', () => {
    const pose = { opacity: 0.5, x: 3, y: -2, scale: 1.2, rotation: 5, blur: 4, reveal: { top: 0, right: 0.3, bottom: 0, left: 0 } };
    expect(applyPose(layer, {}, pose)).toEqual({ opacity: 0.4, rotation: 15, blur: 6, scale: 1.2, x: 3, y: -2, reveal: pose.reveal });
    expect(applyPose(layer, { opacity: 0.5, rotation: 0, blur: 0, scale: 2, x: 10, y: 10 }, pose)).toEqual({ opacity: 0.25, rotation: 5, blur: 4, scale: 2.4, x: 13, y: 8, reveal: pose.reveal });
  });

  test('le flou ne devient jamais négatif', () => {
    expect(applyPose({ opacity: 1 }, {}, { ...REST, blur: -3 }).blur).toBe(0);
  });
});

describe('relance et départ', () => {
  test('une alerte relance si elle est choisie, « toute alerte » les prend toutes', () => {
    expect(restartsAnimationOn({ enter: enter(), restartOn: ['event:raid'] }, 'raid')).toBe(true);
    expect(restartsAnimationOn({ enter: enter(), restartOn: ['event:raid'] }, 'follow')).toBe(false);
    expect(restartsAnimationOn({ enter: enter(), restartOn: ['event:any'] }, 'bits')).toBe(true);
    expect(restartsAnimationOn({ enter: enter() }, 'raid')).toBe(false);
    expect(restartsAnimationOn(undefined, 'raid')).toBe(false);
  });

  test('la scène sortante attend la durée de la sortie « au départ », et seulement elle', () => {
    expect(leaveDelayMs({ exit: exit('fade', 700, { onLeave: true }) })).toBe(700);
    expect(leaveDelayMs({ exit: exit('fade', 700, { afterMs: 100 }) })).toBe(0);
    expect(leaveDelayMs({ enter: enter() })).toBe(0);
    expect(leaveDelayMs(undefined)).toBe(0);
  });
});

describe('dans le document de scène', () => {
  const scene = (animation) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind: 'text', options: {}, animation })] });
  const good = { enter: enter('zoom', 600), exit: exit('fade', 400, { onLeave: true }) };

  test('une couche porte son animation, la scène reste valide', () => {
    expect(validateSceneDoc(scene(good)).ok).toBe(true);
    expect(validateSceneDoc(scene(undefined)).ok).toBe(true);
  });

  test('une animation invalide refuse la scène, avec le chemin du défaut', () => {
    const result = validateSceneDoc(scene({ enter: { preset: 'nope', durationMs: 100 } }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('layers[a].animation.enter.preset');
  });

  test('la forme canonique borne et retire une animation vide ; withoutLook retire l\'animation', () => {
    expect(canonicalSceneDoc(scene({ enter: enter('fade', 5) })).layers[0].animation.enter.durationMs).toBe(50);
    expect('animation' in canonicalSceneDoc(scene({})).layers[0]).toBe(false);
    expect('animation' in withoutLook(createLayer({ id: 'a', kind: 'text', animation: good }))).toBe(false);
  });

  test("une scène dont une couche est animée n'a pas de forme historique", () => {
    expect(currentFromScene(scene(undefined))).not.toBeNull();
    expect(currentFromScene(scene(good))).toBeNull();
  });
});
