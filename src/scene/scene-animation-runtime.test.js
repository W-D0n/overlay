import { describe, expect, test } from 'bun:test';
import { createSceneRuntime } from './scene-runtime.js';
import { createLayer } from './scene-doc.js';

/** Un monde factice : un calque par couche dont on compte les écritures de style, et une horloge qu'on fait avancer à la main. */
function setup() {
  const calques = [];
  const stages = [];
  const writes = [];
  /** Les temporisateurs demandés au moteur, avec leur délai : on les déclenche à la main. */
  const timers = [];
  const listeners = new Set();
  let time = 0;
  const clock = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  /** Ce que la couche de texte reçoit de l'apparition de son texte. */
  const contents = [];
  const registry = { text: () => ({ el: {}, update() {}, destroy() {}, animate: (state) => contents.push(state) }), rain: () => ({ el: {}, update() {}, destroy() {} }) };
  const runtime = createSceneRuntime({ appendChild() {} }, {
    registry,
    clock,
    scheduleFrame: (callback) => callback(),
    scheduleTimeout: (callback, delayMs) => timers.push({ callback, delayMs }),
    createStageCalque: () => {
      const stage = { style: {}, removed: false, appendChild() {}, remove() { stage.removed = true; } };
      stages.push(stage);
      return stage;
    },
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
  return { runtime, calques, stages, writes, timers, listeners, frame, contents };
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

  test("« recommencer » de la timeline rejoue aussi l'animation de chaque couche, comme à l'arrivée de la scène", () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(fadeIn()), logo(fadeIn())));
    frame(0);
    frame(2);
    runtime.timeline.restart();
    frame(2.5);
    expect(calques[0].style.opacity).toBe('0.5');
    expect(calques[1].style.opacity).toBe('0.5');
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

describe('animation de couche dans le moteur : sortie au départ de la scène', () => {
  const arrival = { type: 'fade', durationMs: 400, easing: 'linear' };
  const leaving = (durationMs = 1000, extra = {}) => ({ exit: { preset: 'fade', durationMs, onLeave: true, ease: 'linear' }, ...extra });
  const replace = (runtime, ...layers) => runtime.apply({ ...scene(...layers), transition: arrival });

  test('la scène sortante reste en place le temps de la sortie, puis sa transition commence', () => {
    const { runtime, stages, timers } = setup();
    runtime.apply(scene(title(leaving(1000))));
    replace(runtime, logo(undefined));
    expect(runtime.stageCount()).toBe(2);
    expect(stages[0].style.transition).toBeUndefined();
    expect(timers.map(({ delayMs }) => delayMs).sort((a, b) => a - b)).toEqual([1000, 1400]);
    timers.find(({ delayMs }) => delayMs === 1000).callback();
    expect(stages[0].style.transition).toBe('opacity 400ms linear');
    expect(stages[0].style.opacity).toBe('0');
    timers.find(({ delayMs }) => delayMs === 1400).callback();
    expect(runtime.stageCount()).toBe(1);
    expect(stages[0].removed).toBe(true);
  });

  test('la couche sortante joue sa sortie pendant que la nouvelle scène arrive', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(leaving(1000))));
    frame(0);
    frame(5);
    replace(runtime, logo(undefined));
    frame(5.5);
    expect(calques[0].style.opacity).toBe('0.5');
    frame(6);
    expect(calques[0].style.opacity).toBe('0');
    expect(calques[0].style.display).toBe('none');
  });

  test("sans sortie « au départ », rien ne change : pas d'attente, la transition commence tout de suite", () => {
    const { runtime, stages, timers, listeners } = setup();
    runtime.apply(scene(title(fadeIn())));
    replace(runtime, logo(undefined));
    expect(timers.map(({ delayMs }) => delayMs)).toEqual([400]);
    expect(stages[0].style.transition).toBe('opacity 400ms linear');
    expect(listeners.size).toBe(0);
  });

  test('une sortie à date fixe ne retient pas la scène', () => {
    const { runtime, timers } = setup();
    runtime.apply(scene(title({ exit: { preset: 'fade', durationMs: 1000, afterMs: 9000 } })));
    replace(runtime, logo(undefined));
    expect(timers.map(({ delayMs }) => delayMs)).toEqual([400]);
  });

  test('la scène attend la plus longue des sorties', () => {
    const { runtime, timers } = setup();
    runtime.apply(scene(title(leaving(500)), logo(leaving(1500))));
    replace(runtime, createLayer({ id: 'autre', kind: 'text' }));
    expect(timers.map(({ delayMs }) => delayMs).sort((a, b) => a - b)).toEqual([1500, 1900]);
  });

  test("l'horloge reste branchée pendant l'attente et se libère quand la scène est retirée", () => {
    const { runtime, listeners, timers } = setup();
    runtime.apply(scene(title(leaving(1000))));
    replace(runtime, logo(undefined));
    expect(listeners.size).toBe(1);
    timers.find(({ delayMs }) => delayMs === 1400).callback();
    expect(listeners.size).toBe(0);
  });

  test('une coupure franche (durée nulle) ou le premier montage ne jouent aucune sortie', () => {
    const { runtime, stages, timers } = setup();
    runtime.apply({ ...scene(title(leaving(1000))), transition: arrival });
    expect(timers).toEqual([]);
    runtime.apply({ ...scene(logo(undefined)), transition: { ...arrival, durationMs: 0 } });
    expect(timers).toEqual([]);
    expect(runtime.stageCount()).toBe(1);
    expect(stages[0].removed).toBe(true);
  });

  test('un réglage en direct (sans transition) ne joue pas de sortie', () => {
    const { runtime, calques, timers, frame } = setup();
    runtime.apply(scene(title(leaving(1000))));
    frame(0);
    runtime.apply(scene(title(leaving(1000), { opacity: 0.9 })));
    frame(5);
    expect(timers).toEqual([]);
    expect(calques[0].style.opacity).toBe('0.9');
  });

  test('les valeurs de base de la couche sortante sont figées à son départ, la timeline de la scène suivante ne les change pas', () => {
    const { runtime, calques, frame } = setup();
    const dim = { target: 'opacity', keys: [{ t: 0, v: 1, ease: 'linear' }, { t: 1000, v: 0.5, ease: 'linear' }] };
    runtime.apply(scene(title(leaving(1000), { timeline: [dim] })));
    frame(0);
    frame(5);
    replace(runtime, logo(undefined));
    frame(5.5);
    expect(calques[0].style.opacity).toBe('0.25');
  });

  test("une alerte pendant l'attente ne relance pas la couche qui part", () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(leaving(1000, { restartOn: ['event:raid'] }))));
    frame(0);
    frame(5);
    replace(runtime, logo(undefined));
    frame(5.5);
    runtime.react({ type: 'raid' });
    frame(5.75);
    expect(calques[0].style.opacity).toBe('0.25');
  });

  test("la transition d'une scène retirée entre-temps n'est pas rejouée sur elle", () => {
    const { runtime, stages, timers } = setup();
    runtime.apply(scene(title(leaving(1000))));
    replace(runtime, logo(leaving(1000)));
    const firstHold = timers.find(({ delayMs }) => delayMs === 1000);
    replace(runtime, createLayer({ id: 'autre', kind: 'text' }));
    timers.filter(({ delayMs }) => delayMs === 1400).at(-1).callback();
    expect(stages[0].removed).toBe(true);
    stages[0].style.transition = undefined;
    firstHold.callback();
    expect(stages[0].style.transition).toBeUndefined();
  });
});

describe('animation de couche dans le moteur : texte qui se dévoile', () => {
  const typed = (extra = {}) => ({ enter: { preset: 'type', durationMs: 1000, ease: 'linear' }, ...extra });

  test("la couche de texte reçoit l'état dès le montage, avant toute image", () => {
    const { runtime, contents } = setup();
    runtime.apply(scene(title(typed())));
    expect(contents).toEqual([{ kind: 'text', unit: 'chars', reveal: 'hard', presence: 0 }]);
  });

  test("puis la présence avance avec l'horloge de la couche, et cesse de changer une fois le texte entier", () => {
    const { runtime, contents, frame } = setup();
    runtime.apply(scene(title(typed())));
    frame(0);
    frame(0.5);
    expect(contents.at(-1)).toEqual({ kind: 'text', unit: 'chars', reveal: 'hard', presence: 0.5 });
    frame(2);
    expect(contents.at(-1).presence).toBe(1);
    const count = contents.length;
    frame(3);
    frame(4);
    expect(contents.length).toBe(count);
  });

  test('le calque reste au repos pendant que le texte se dévoile', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(title(typed())));
    frame(0);
    frame(0.5);
    expect(calques[0].style.opacity).toBe('1');
    expect(calques[0].style.transform).toBe('');
  });

  test('une animation sans texte, ou aucune animation, donne le texte entier', () => {
    const { runtime, contents } = setup();
    runtime.apply(scene(title({ enter: { preset: 'fade', durationMs: 1000 } })));
    expect(contents).toEqual([null]);
    runtime.apply(scene(title(undefined)));
    expect(contents.at(-1)).toBeNull();
  });

  test("retirer l'animation rend le texte entier tout de suite", () => {
    const { runtime, contents, frame } = setup();
    runtime.apply(scene(title(typed())));
    frame(0);
    frame(0.3);
    runtime.apply(scene(title(undefined)));
    expect(contents.at(-1)).toBeNull();
  });

  test("la sortie de texte retire le texte puis la couche sort de l'affichage", () => {
    const { runtime, calques, contents, frame } = setup();
    runtime.apply(scene(title({ exit: { preset: 'letters', durationMs: 1000, afterMs: 1000, ease: 'linear' } })));
    frame(0);
    frame(1.5);
    expect(contents.at(-1)).toEqual({ kind: 'text', unit: 'chars', reveal: 'soft', presence: 0.5 });
    frame(2.5);
    expect(contents.at(-1).presence).toBe(0);
    expect(calques[0].style.display).toBe('none');
  });

  test("une alerte choisie rejoue l'apparition du texte", () => {
    const { runtime, contents, frame } = setup();
    runtime.apply(scene(title(typed({ restartOn: ['event:raid'] }))));
    frame(0);
    frame(2);
    expect(contents.at(-1).presence).toBe(1);
    runtime.react({ type: 'raid' });
    frame(2.25);
    expect(contents.at(-1).presence).toBeCloseTo(0.25, 9);
  });

  test("se placer dans la timeline garde l'apparition du texte à son instant", () => {
    const { runtime, contents, frame } = setup();
    runtime.apply(scene(title(typed())));
    frame(0);
    frame(0.5);
    frame(0.75);
    runtime.timeline.seek(0);
    expect(contents.at(-1).presence).toBeCloseTo(0.75, 9);
  });

  test('une couche sans méthode animate ne gêne pas', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(logo({ enter: { preset: 'fade', durationMs: 1000, ease: 'linear' } })));
    frame(0);
    frame(0.5);
    expect(calques[0].style.opacity).toBe('0.5');
  });
});
