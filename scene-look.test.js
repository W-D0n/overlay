import { describe, expect, test } from 'bun:test';
import { BLEND_MODES, canonicalSceneDoc, createLayer, currentFromScene, LOOK_LIMITS, readPath, sceneFromPreset, validateSceneDoc, writePath } from './scene-doc.js';
import { createSceneRuntime } from './scene-runtime.js';

const base = () => sceneFromPreset({ id: 'nuit', name: 'Nuit', component: 'rain', options: {} });
const withLook = (look) => {
  const scene = base();
  scene.layers[0] = { ...scene.layers[0], ...look };
  return scene;
};
const errorsOf = (scene) => {
  const result = validateSceneDoc(scene);
  return result.ok ? [] : result.errors;
};

describe('rendu étendu : forme canonique', () => {
  test('les valeurs neutres sont retirées : absent = neutre, un fichier sans ces champs reste identique', () => {
    const scene = withLook({ blend: 'normal', rotation: 0, blur: 0, crop: { top: 0, right: 0, bottom: 0, left: 0 } });
    const [layer] = canonicalSceneDoc(scene).layers;
    for (const key of ['blend', 'rotation', 'blur', 'crop']) expect(key in layer).toBe(false);
    expect(canonicalSceneDoc(base())).toEqual(base());
  });

  test('rotation, flou et rognage sont ramenés dans leurs bornes', () => {
    const [layer] = canonicalSceneDoc(withLook({ rotation: 400, blur: 99, crop: { top: 2, left: -1 } })).layers;
    expect(layer.rotation).toBe(LOOK_LIMITS.rotation.max);
    expect(layer.blur).toBe(LOOK_LIMITS.blur.max);
    expect(layer.crop).toEqual({ top: LOOK_LIMITS.crop.max, right: 0, bottom: 0, left: 0 });
  });

  test('deux côtés opposés ne rognent jamais toute la couche', () => {
    const [layer] = canonicalSceneDoc(withLook({ crop: { top: 0.9, bottom: 0.9, left: 0.5, right: 0.5 } })).layers;
    expect(layer.crop.top + layer.crop.bottom).toBeLessThanOrEqual(LOOK_LIMITS.cropPair + 1e-9);
    expect(layer.crop.left + layer.crop.right).toBeLessThanOrEqual(LOOK_LIMITS.cropPair + 1e-9);
    expect(validateSceneDoc(canonicalSceneDoc(withLook({ crop: { top: 0.9, bottom: 0.9 } }))).ok).toBe(true);
  });

  test('un rognage partiel est complété par des côtés à zéro', () => {
    const [layer] = canonicalSceneDoc(withLook({ crop: { left: 0.1 } })).layers;
    expect(layer.crop).toEqual({ top: 0, right: 0, bottom: 0, left: 0.1 });
  });
});

describe('rendu étendu : validation', () => {
  test('un rendu valide est accepté, y compris chaque mode de fusion proposé', () => {
    for (const { id } of BLEND_MODES) expect(errorsOf(withLook({ blend: id, rotation: 3, blur: 4, crop: { top: 0.1, right: 0, bottom: 0.1, left: 0 } }))).toEqual([]);
  });

  test('un mode de fusion inconnu, un angle ou un flou qui n’est pas un nombre, un rognage mal formé sont refusés', () => {
    expect(errorsOf(withLook({ blend: 'color-dodge' }))[0]).toContain('blend');
    expect(errorsOf(withLook({ rotation: '3' }))[0]).toContain('rotation');
    expect(errorsOf(withLook({ blur: Number.NaN }))[0]).toContain('blur');
    expect(errorsOf(withLook({ crop: 4 }))[0]).toContain('crop');
    expect(errorsOf(withLook({ crop: { top: 'x' } }))[0]).toContain('crop.top');
  });

  test('un rognage qui efface la couche est refusé', () => {
    expect(errorsOf(withLook({ crop: { top: 0.5, bottom: 0.5 } }))[0]).toContain('crop');
  });
});

describe('rendu étendu : chemins adressables', () => {
  test('blend, rotation, blur et chaque côté du rognage se lisent et s’écrivent par chemin', () => {
    let scene = base();
    for (const [path, value] of [['layers[main].blend', 'screen'], ['layers[main].rotation', 12], ['layers[main].blur', 2], ['layers[main].crop.left', 0.25]]) {
      const written = writePath(scene, path, value);
      expect(written.ok).toBe(true);
      scene = written.scene;
      expect(readPath(scene, path)).toEqual({ ok: true, value });
    }
    expect(scene.layers[0].crop).toEqual({ left: 0.25 });
  });

  test('un côté de rognage inconnu n’a pas de chemin ; lire un rognage absent donne undefined', () => {
    expect(writePath(base(), 'layers[main].crop.middle', 1).ok).toBe(false);
    expect(readPath(base(), 'layers[main].crop.top')).toEqual({ ok: true, value: undefined });
  });
});

describe('rendu étendu : forme historique', () => {
  test('une couche au rendu étendu ne se projette pas sur { component, options } : rien ne se perd en silence', () => {
    expect(currentFromScene(base())).not.toBeNull();
    for (const look of [{ blend: 'multiply' }, { rotation: 3 }, { blur: 4 }, { crop: { top: 0.1 } }]) {
      expect(currentFromScene(withLook(look))).toBeNull();
    }
  });
});

describe('rendu étendu : le moteur', () => {
  /** Monde factice sans DOM : on lit les styles posés sur le calque de la couche. */
  function mounted(scene) {
    const calques = [];
    const container = { appendChild: () => {} };
    const runtime = createSceneRuntime(container, {
      registry: { rain: () => ({ el: {}, update: () => {}, destroy: () => {} }) },
      createStageCalque: () => ({ style: {}, appendChild: () => {}, remove: () => {} }),
      createCalque: () => {
        const calque = { style: {}, appendChild: () => {}, remove: () => {} };
        calques.push(calque);
        return calque;
      },
    });
    runtime.apply(scene);
    return { runtime, calque: calques[0] };
  }
  const layer = (extra) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind: 'rain', ...extra })] });

  test('chaque réglage devient le style du calque', () => {
    const { calque } = mounted(layer({ blend: 'screen', rotation: -12.5, blur: 4, crop: { top: 0.1, right: 0.2, bottom: 0.3, left: 0.05 } }));
    expect(calque.style.mixBlendMode).toBe('screen');
    expect(calque.style.transform).toBe('rotate(-12.5deg)');
    expect(calque.style.clipPath).toBe('inset(10% 20% 30% 5%)');
    expect(calque.style.filter).toBe('blur(calc(var(--reference-scale, 1) * 4px))');
  });

  test('une couche sans rendu étendu n’écrit aucun style de rendu, et les retirer efface ceux d’avant', () => {
    const { runtime, calque } = mounted(layer({ blend: 'multiply', rotation: 3, blur: 2, crop: { left: 0.1 } }));
    runtime.apply(layer({}));
    for (const key of ['mixBlendMode', 'transform', 'clipPath', 'filter']) expect(calque.style[key]).toBe('');
  });
});
