// @ts-check

/**
 * components/GroupLayer.js — The container of a layer group: an empty full-frame element that receives the layer elements of the group
 * (`scene-runtime.js`). It draws nothing itself; the group's look (opacity, blend, filters, transform…) is applied to the element that wraps it,
 * so it affects the members as one composed whole. See docs/specs/groupes-de-couches.md.
 *
 * @param {unknown} [_options] a group has no options
 * @param {{ documentRef?: Document }} [environment]
 * @returns {import('../types.js').ComponentInstance}
 */
export function GroupLayer(_options, environment = {}) {
  const documentRef = environment.documentRef ?? document;
  const el = documentRef.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  return { el };
}
