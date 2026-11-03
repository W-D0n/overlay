import { describe, expect, test } from 'bun:test';
import { animationErrors, evaluateAnimation, setPhase, usesGlyphs } from './layer-animation.js';
import { createSceneEditor } from './dev/scene-editor.js';
import { createLayer, validateSceneDoc } from './scene-doc.js';

const REST = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, blur: 0, reveal: { top: 0, right: 0, bottom: 0, left: 0 } };
const enter = (preset, durationMs = 1000, extra = {}) => ({ preset, durationMs, ease: 'linear', ...extra });
const exit = (preset, durationMs = 1000, extra = {}) => ({ preset, durationMs, ease: 'linear', ...extra });

describe('préréglages de texte : validation', () => {
  test('réservés aux couches de texte, à l\'entrée comme à la sortie', () => {
    expect(animationErrors('a', { enter: enter('type') })).toEqual(['a.enter.preset : réservé aux couches de texte']);
    expect(animationErrors('a', { exit: exit('letters', 500, { onLeave: true }) })).toEqual(['a.exit.preset : réservé aux couches de texte']);
    expect(animationErrors('a', { enter: enter('type'), exit: exit('words', 500, { onLeave: true }) }, { glyphs: true })).toEqual([]);
    expect(animationErrors('a', { enter: enter('fade') })).toEqual([]);
  });

  test('dans une scène, le texte les accepte et les autres types les refusent avec le chemin du défaut', () => {
    const scene = (kind) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind, options: {}, animation: { enter: enter('words') } })] });
    expect(validateSceneDoc(scene('text')).ok).toBe(true);
    const refused = validateSceneDoc(scene('rain'));
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toContain('layers[a].animation.enter.preset');
  });

  test('un préréglage de texte neuf prend une durée lisible, un préréglage de calque non', () => {
    expect(setPhase(undefined, 'enter', 'type').enter.durationMs).toBe(1500);
    expect(setPhase(undefined, 'exit', 'letters').exit).toEqual({ preset: 'letters', durationMs: 1500, onLeave: true });
    expect(setPhase(undefined, 'enter', 'fade').enter.durationMs).toBe(600);
    expect(setPhase({ enter: enter('type', 900) }, 'enter', 'words').enter.durationMs).toBe(900);
  });
});

describe('préréglages de texte : changer le type de la couche', () => {
  const editorWith = (kind, animation) => createSceneEditor({ scene: { version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind, options: {}, animation })] } });

  test('un préréglage de texte interdit de passer à un type qui ne dessine pas de texte, et le dit', () => {
    const editor = editorWith('text', { enter: enter('type') });
    const refused = editor.setLayerKind('a', 'shape');
    expect(refused).toMatchObject({ ok: false, reason: 'invalid' });
    expect(refused.message).toContain('choisissez-en une autre');
    expect(editor.state().scene.layers[0].kind).toBe('text');
  });

  test('en sortie comme en entrée', () => {
    expect(editorWith('text', { exit: exit('words', 500, { onLeave: true }) }).setLayerKind('a', 'shape').ok).toBe(false);
  });

  test('un préréglage de calque, ou aucune animation, laisse changer de type', () => {
    expect(editorWith('text', { enter: enter('fade') }).setLayerKind('a', 'shape').ok).toBe(true);
    expect(editorWith('text', undefined).setLayerKind('a', 'shape').ok).toBe(true);
  });

  test('usesGlyphs lit l\'entrée et la sortie', () => {
    expect(usesGlyphs({ enter: enter('letters') })).toBe(true);
    expect(usesGlyphs({ exit: exit('type', 500, { onLeave: true }) })).toBe(true);
    expect(usesGlyphs({ enter: enter('fade'), loop: { preset: 'float', periodMs: 1000 } })).toBe(false);
    expect(usesGlyphs(undefined)).toBe(false);
  });
});

describe('préréglages de texte : évaluation', () => {
  test('le calque reste au repos et la présence du texte avance avec l\'entrée', () => {
    const animation = { enter: enter('letters', 1000) };
    expect(evaluateAnimation(animation, 0)).toEqual({ pose: REST, gone: false, glyph: { unit: 'chars', reveal: 'soft', presence: 0 } });
    expect(evaluateAnimation(animation, 250).glyph.presence).toBeCloseTo(0.25, 9);
    expect(evaluateAnimation(animation, 250).pose).toEqual(REST);
    expect(evaluateAnimation(animation, 1000).glyph.presence).toBe(1);
    expect(evaluateAnimation(animation, 9999).glyph.presence).toBe(1);
  });

  test('le retard retarde le texte, et la manière suit le préréglage', () => {
    const animation = { enter: enter('type', 1000, { delayMs: 500 }) };
    expect(evaluateAnimation(animation, 400).glyph).toEqual({ unit: 'chars', reveal: 'hard', presence: 0 });
    expect(evaluateAnimation(animation, 1000).glyph.presence).toBeCloseTo(0.5, 9);
    expect(evaluateAnimation({ enter: enter('words') }, 500).glyph).toMatchObject({ unit: 'words', reveal: 'soft' });
  });

  test('sans préréglage de texte, aucun état de texte', () => {
    expect(evaluateAnimation({ enter: enter('fade') }, 300).glyph).toBeNull();
    expect(evaluateAnimation({ loop: { preset: 'float', periodMs: 1000 } }, 300).glyph).toBeNull();
    expect(evaluateAnimation(undefined, 300).glyph).toBeNull();
  });

  test('une sortie de texte retire le texte et finit invisible', () => {
    const animation = { exit: exit('type', 1000, { afterMs: 2000 }) };
    expect(evaluateAnimation(animation, 1500).glyph.presence).toBe(1);
    expect(evaluateAnimation(animation, 2250).glyph.presence).toBeCloseTo(0.75, 9);
    expect(evaluateAnimation(animation, 2250).gone).toBe(false);
    expect(evaluateAnimation(animation, 3000)).toMatchObject({ gone: true, glyph: { presence: 0 } });
  });

  test('au départ de la scène, le texte se retire depuis l\'instant du départ', () => {
    const animation = { exit: exit('words', 1000, { onLeave: true }) };
    expect(evaluateAnimation(animation, 7000, null).glyph.presence).toBe(1);
    expect(evaluateAnimation(animation, 7500, 7000).glyph.presence).toBeCloseTo(0.5, 9);
  });

  test('entrée de texte puis sortie de calque : le texte reste entier pendant que le calque sort', () => {
    const animation = { enter: enter('letters', 500), exit: exit('fade', 1000, { afterMs: 2000 }) };
    const mid = evaluateAnimation(animation, 2500);
    expect(mid.glyph.presence).toBe(1);
    expect(mid.pose.opacity).toBeCloseTo(0.5, 9);
  });

  test('entrée de calque puis sortie de texte : le texte est entier avant la sortie, la manière est celle de la sortie', () => {
    const animation = { enter: enter('fade', 500), exit: exit('type', 1000, { afterMs: 2000 }) };
    expect(evaluateAnimation(animation, 100).glyph).toEqual({ unit: 'chars', reveal: 'hard', presence: 1 });
    expect(evaluateAnimation(animation, 2500).glyph.presence).toBeCloseTo(0.5, 9);
  });

  test('entrée et sortie de texte de manières différentes : chacune sa manière', () => {
    const animation = { enter: enter('letters', 500), exit: exit('type', 1000, { afterMs: 2000 }) };
    expect(evaluateAnimation(animation, 250).glyph).toMatchObject({ reveal: 'soft', unit: 'chars' });
    expect(evaluateAnimation(animation, 2500).glyph).toMatchObject({ reveal: 'hard' });
  });
});
