// @ts-check
/**
 * Layer groups on the real render page (the one OBS loads): a scene with a group is published to the server and the page nests its members' elements
 * in the group element, applies the group look to the whole, turns it around the center of its members' box, and follows the group being hidden or removed.
 */
import { openStudio } from '../studio.js';

export const name = 'groupes de couches à l’antenne';

const FULL = { x: 0, y: 0, width: 1, height: 1 };
/** The canvases of the scene itself: the page keeps one more, directly under `#bg-layer`, for the alert reactions. */
const SCENE_CANVASES = "document.querySelectorAll('#bg-layer > div canvas')";
const layer = (/** @type {string} */ id, /** @type {string} */ kind, /** @type {object} */ extra = {}) => ({ id, kind, visible: true, opacity: 1, placement: FULL, options: {}, ...extra });
const at = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ width, /** @type {number} */ height) => ({ x, y, width, height });

/** @param {boolean} hidden @param {object} look */
const grouped = (hidden = false, look = {}) => ({
  version: 1,
  id: 'group-scene',
  name: 'Group scene',
  layers: [
    layer('a', 'text', { group: 'g', placement: at(0.1, 0.1, 0.3, 0.2), options: { text: ['A'] } }),
    layer('b', 'shape', { group: 'g', placement: at(0.5, 0.5, 0.3, 0.3) }),
    layer('g', 'group', { visible: !hidden, placement: at(0.1, 0.1, 0.7, 0.7), opacity: 0.5, rotation: 10, ...look }),
    layer('c', 'text', { options: { text: ['C'] } }),
  ],
});

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/state', { scene: grouped() });
  await page.goto(`http://localhost:${stack.staticPort}/background.html?transparent=1&role=studio`);
  const mounted = await page.waitFor(`${SCENE_CANVASES}.length >= 3`, 15_000);
  check('the render page draws the three layers of the scene', mounted);
  await page.sleep(300);

  // The scene canvases in mount order: the group's two members, then the free layer. Each canvas sits in its layer calque ; a member's calque sits in the group element.
  const layout = await page.evaluate(`(() => {
    const [first, second, third] = [...${SCENE_CANVASES}];
    const groupElement = first.parentElement.parentElement;
    const groupCalque = groupElement.parentElement;
    return {
      count: ${SCENE_CANVASES}.length,
      sameGroupElement: second.parentElement.parentElement === groupElement,
      freeBesideGroup: third.parentElement.parentElement === groupCalque.parentElement,
      freeNotInGroup: third.parentElement.parentElement !== groupElement,
    };
  })()`);
  check('the two members share the group element, the free layer sits beside the group calque', layout.count === 3 && layout.sameGroupElement && layout.freeBesideGroup && layout.freeNotInGroup ? true : layout);

  const groupCalque = `(() => [...${SCENE_CANVASES}][0].parentElement.parentElement.parentElement)()`;
  const memberCalque = `(() => [...${SCENE_CANVASES}][0].parentElement)()`;
  const style = (/** @type {string} */ element) => page.evaluate(`(() => { const el = ${element}; const s = getComputedStyle(el); return { opacity: Number(s.opacity), transform: s.transform, origin: s.transformOrigin, width: el.offsetWidth, height: el.offsetHeight, left: el.offsetLeft, top: el.offsetTop }; })()`);
  const group = await style(groupCalque);
  const member = await style(memberCalque);
  check('the group opacity (0.5) is on the group element as a whole, not on its members', group.opacity === 0.5 && member.opacity === 1 ? true : [group.opacity, member.opacity]);
  check('the group rotation is on the group element', group.transform !== 'none' && member.transform === 'none' ? true : [group.transform, member.transform]);
  check('the group covers the whole frame', group.left === 0 && group.top === 0 && group.width > 0 ? true : group);

  // Its center of rotation is the center of the box of its members: (0.1..0.8) × (0.1..0.8) → 45 % of the frame.
  const [originX, originY] = group.origin.split(' ').map((part) => Number.parseFloat(part));
  check('it turns around the center of its members\' box (45 % of the frame), not the center of the frame', Math.abs(originX - group.width * 0.45) < 1.5 && Math.abs(originY - group.height * 0.45) < 1.5 ? true : [group.origin, group.width, group.height]);

  // The member keeps its own place in the frame.
  check('a member keeps its placement in fractions of the scene', Math.abs(member.width - group.width * 0.3) < 1.5 && Math.abs(member.left - group.width * 0.1) < 1.5 ? true : [member, group]);

  // Hiding the group removes its members from the page.
  await stack.api('/state', { scene: grouped(true) });
  const hidden = await page.waitFor(`${SCENE_CANVASES}.length === 1`, 8000);
  check('hiding the group takes its members off the page, the free layer stays', hidden ? true : await page.evaluate(`${SCENE_CANVASES}.length`));

  // Showing it again brings them back.
  await stack.api('/state', { scene: grouped(false, { opacity: 1, rotation: 0 }) });
  const back = await page.waitFor(`${SCENE_CANVASES}.length === 3`, 8000);
  await page.sleep(200);
  const restored = await style(groupCalque);
  check('showing it again brings the members back, with the new look of the group', back && restored.opacity === 1 && restored.transform === 'none' ? true : restored);

  // A scene without group again: the group element is gone.
  await stack.api('/state', { scene: { version: 1, id: 'flat', name: 'Flat', layers: [layer('c', 'text', { options: { text: ['C'] } })] } });
  const flat = await page.waitFor(`${SCENE_CANVASES}.length === 1`, 8000);
  check('a scene without group leaves no group element behind', flat && (await page.evaluate("document.querySelectorAll('#bg-layer > div > div').length")) === 1 ? true : await page.evaluate("document.querySelectorAll('#bg-layer > div > div').length"));

  check('no error in the console', errors.length === 0 ? true : errors.slice());
}
