import { describe, expect, test } from 'bun:test';
import { createSceneRuntime } from './scene-runtime.js';
import { createLayer } from './scene-doc.js';

/** Un monde factice : un calque par couche dont on compte les écritures de style, et une horloge qu'on fait avancer à la main. */
function setup() {
  const calques = [];
  const writes = [];
  const listeners = new Set();
  let time = 0;
  const clock = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  const registry = { text: () => ({ el: {}, update() {}, destroy() {} }), rain: () => ({ el: {}, update() {}, destroy() {} }) };
  const runtime = createSceneRuntime({ appendChild() {} }, {
    registry,
    clock,
    createStageCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
    createCalque: () => {
      const index = calques.length;
      const style = new Proxy({}, { set: (target, key, value) => { writes.push([index, key, value]); target[key] = value; return true; } });
      const calque = { style, appendChild() {}, remove() {} };
      calques.push(calque);
      return calque;
    },
  });
  /** Une image à `seconds` secondes du départ. */
  const frame = (seconds) => {
    const dt = seconds - time;
    time = seconds;
    for (const listener of [...listeners]) listener({ dt, time, pixelRatio: 1 });
  };
  return { runtime, calques, writes, listeners, frame };
}

const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });
const title = (animation, extra = {}) => createLayer({ id: 'titre', kind: 'text', animation, ...extra });
const logo = (animation, extra = {}) => createLayer({ id: 'logo', kind: 'rain', animation, ...extra });
const fadeIn = (extra = {}) => ({ enter: { preset: 'fade', durationMs: 1000, ease: 'linear' }, ...extra });

describe('animation de couche dans le moteur : horloge', () => {
  test('sans animation aucune horloge ; avec une animation une seule ; elle s\'arrête avec la dernière', () => {
    const { runtime, listeners } = setup();
    runtime.apply(scene(title(undefined)));
    expect(listeners.size).toBe(0);
    runtime.apply(scene(title(fadeIn())));
    expect(listeners.size).toBe(1);
    runtime.apply(scene(title(fadeIn()), logo(fadeIn())));
    expect(listeners.size).toBe(1);
    runtime.apply(scene(title(undefined)));
    expect(listeners.size).toBe(0);
  });
});

describe('animation de couche dans le moteur : entrée', () => {
  test('la couche est invisible dès son montage, sans attendre la première image', () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(title(fadeIn())));
    expect(calques[0].style.opacity).toBe('0');
  });

  test('l\'entrée avance avec l\'horloge de la couche et finit au repos', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(0.5);
    expect(calques[0].style.opacity).toBe('0.5');
    frame(1);
    expect(calques[0].style.opacity).toBe('1');
    frame(3);
    expect(calques[0].style.opacity).toBe('1');
  });

  test('une fois au repos, plus aucune écriture de style', () => {
    const { runtime, writes, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(2);
    const count = writes.length;
    frame(3);
    frame(4);
    expect(writes.length).toBe(count);
  });

  test('l\'animation se superpose à l\'opacité de la couche', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn(), { opacity: 0.8 })));
    frame(0);
    frame(0.5);
    expect(calques[0].style.opacity).toBe('0.4');
    frame(2);
    expect(calques[0].style.opacity).toBe('0.8');
  });

  test('un glissement décale la couche en pourcentage de sa taille', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ enter: { preset: 'slide-bottom', durationMs: 1000, ease: 'linear' } })));
    frame(0);
    frame(0.5);
    expect(calques[0].style.transform).toBe('translate(0%, 6%)');
    frame(2);
    expect(calques[0].style.transform).toBe('');
  });

  test('une révélation rogne la couche, en plus de son rognage', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ enter: { preset: 'wipe-right', durationMs: 1000, ease: 'linear' } }, { crop: { top: 0, right: 0, bottom: 0, left: 0.1 } })));
    frame(0);
    frame(0.5);
    expect(calques[0].style.clipPath).toBe('inset(0% 50% 0% 10%)');
    frame(2);
    expect(calques[0].style.clipPath).toBe('inset(0% 0% 0% 10%)');
  });

  test('une révélation seule, sans rognage de la couche, masque la part voulue', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ enter: { preset: 'wipe-down', durationMs: 1000, ease: 'linear' } })));
    frame(0);
    frame(0.25);
    expect(calques[0].style.clipPath).toBe('inset(0% 0% 75% 0%)');
  });

  test('sans rognage ni révélation en cours, aucun masque (le flou et l\'ombre ne sont pas coupés)', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ enter: { preset: 'wipe-right', durationMs: 1000, ease: 'linear' } })));
    frame(0);
    frame(2);
    expect(calques[0].style.clipPath).toBe('');
  });
});

describe('animation de couche dans le moteur : boucle et sortie', () => {
  test('la boucle tourne après l\'entrée', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ loop: { preset: 'sway', periodMs: 4000 } })));
    frame(0);
    frame(1);
    expect(calques[0].style.transform).toBe('rotate(3deg)');
    frame(3);
    expect(calques[0].style.transform).toBe('rotate(-3deg)');
  });

  test('une sortie à date fixe rend la couche invisible et elle le reste', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ exit: { preset: 'fade', durationMs: 1000, afterMs: 2000, ease: 'linear' } })));
    frame(0);
    frame(1);
    expect(calques[0].style.opacity).toBe('1');
    frame(2.5);
    expect(calques[0].style.opacity).toBe('0.5');
    expect(calques[0].style.display).toBe('');
    frame(3);
    expect(calques[0].style.opacity).toBe('0');
    frame(10);
    expect(calques[0].style.opacity).toBe('0');
  });

  test("une couche dont la sortie est finie sort de l'affichage (elle ne coûte plus rien) jusqu'à sa relance", () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ exit: { preset: 'fade', durationMs: 1000, afterMs: 1000, ease: 'linear' }, restartOn: ['event:raid'] })));
    frame(0);
    frame(1.5);
    expect(calques[0].style.display).toBe('');
    frame(2);
    expect(calques[0].style.display).toBe('none');
    runtime.react({ type: 'raid' });
    frame(2.1);
    expect(calques[0].style.display).toBe('');
  });

  test("une couche masquée reste masquée, animation ou non", () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(title(fadeIn()), logo(fadeIn(), { visible: false })));
    expect(calques.length).toBe(1);
    expect(calques[0].style.display).toBe('');
  });

  test('une sortie « au départ de la scène » ne joue pas tant que la scène est en place', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ exit: { preset: 'fade', durationMs: 1000, onLeave: true } })));
    frame(0);
    frame(30);
    expect(calques[0].style.opacity).toBe('1');
  });
});

describe('animation de couche dans le moteur : relance par alerte, couche par couche', () => {
  test('une alerte choisie rejoue l\'animation de la couche', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn({ restartOn: ['event:raid'] }))));
    frame(0);
    frame(2);
    expect(calques[0].style.opacity).toBe('1');
    runtime.react({ type: 'raid' });
    frame(2.5);
    expect(calques[0].style.opacity).toBe('0.5');
    frame(4);
    expect(calques[0].style.opacity).toBe('1');
  });

  test('une alerte non choisie ne relance rien', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn({ restartOn: ['event:raid'] }))));
    frame(0);
    frame(2);
    runtime.react({ type: 'follow' });
    frame(2.5);
    expect(calques[0].style.opacity).toBe('1');
  });

  test('« toute alerte » relance sur n\'importe quelle alerte', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn({ restartOn: ['event:any'] }))));
    frame(0);
    frame(2);
    runtime.react({ type: 'bits' });
    frame(2.25);
    expect(calques[0].style.opacity).toBe('0.25');
  });

  test('seule la couche concernée repart, les autres continuent', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn({ restartOn: ['event:raid'] })), logo(fadeIn())));
    frame(0);
    frame(2);
    runtime.react({ type: 'raid' });
    frame(2.5);
    expect(calques[0].style.opacity).toBe('0.5');
    expect(calques[1].style.opacity).toBe('1');
  });

  test('une couche sortie revient à une alerte choisie', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title({ exit: { preset: 'fade', durationMs: 500, afterMs: 1000, ease: 'linear' }, restartOn: ['event:raid'] })));
    frame(0);
    frame(5);
    expect(calques[0].style.opacity).toBe('0');
    runtime.react({ type: 'raid' });
    frame(5.1);
    expect(calques[0].style.opacity).toBe('1');
  });

  test('l\'alerte relance aussi la timeline de la scène sans confondre les deux horloges', () => {
    const { runtime, frame } = setup();
    runtime.apply({ ...scene(title(fadeIn({ restartOn: ['event:raid'] }))), timeline: { durationMs: 4000, loop: 'once', restartOn: ['event:follow'] } });
    frame(0);
    frame(3);
    runtime.react({ type: 'raid' });
    frame(3.5);
    expect(runtime.timeline.state().timeMs).toBeCloseTo(3500, -1);
    runtime.react({ type: 'follow' });
    frame(3.6);
    expect(runtime.timeline.state().timeMs).toBeLessThan(500);
  });
});

describe('animation de couche dans le moteur : édition', () => {
  test('modifier l\'animation la rejoue depuis le début', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(2);
    expect(calques[0].style.opacity).toBe('1');
    runtime.apply(scene(title({ enter: { preset: 'fade', durationMs: 2000, ease: 'linear' } })));
    expect(calques[0].style.opacity).toBe('0');
    frame(3);
    expect(calques[0].style.opacity).toBe('0.5');
  });

  test('un réglage sans rapport avec l\'animation ne la rejoue pas', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(2);
    runtime.apply(scene(title(fadeIn(), { name: 'Autre' })));
    expect(calques[0].style.opacity).toBe('1');
  });

  test('retirer l\'animation rend la couche à ses valeurs de base', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn(), { opacity: 0.8 })));
    frame(0);
    frame(0.5);
    runtime.apply(scene(title(undefined, { opacity: 0.8 })));
    expect(calques[0].style.opacity).toBe('0.8');
  });

  test('masquer puis remontrer la couche rejoue son entrée', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(2);
    runtime.apply(scene(title(fadeIn(), { visible: false })));
    runtime.apply(scene(title(fadeIn())));
    expect(calques[1].style.opacity).toBe('0');
  });

  test("se placer dans la timeline garde l'animation de la couche à son instant", () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn())));
    frame(0);
    frame(0.5);
    runtime.timeline.seek(0);
    expect(calques[0].style.opacity).toBe('0.5');
  });

  test('la timeline de la scène et l\'animation de la couche se composent', () => {
    const { runtime, calques, frame } = setup();
    const fade = { target: 'opacity', keys: [{ t: 0, v: 0.5, ease: 'linear' }] };
    runtime.apply(scene(title(fadeIn(), { timeline: [fade] })));
    frame(0);
    frame(0.5);
    expect(calques[0].style.opacity).toBe('0.25');
    frame(2);
    expect(calques[0].style.opacity).toBe('0.5');
  });
});
