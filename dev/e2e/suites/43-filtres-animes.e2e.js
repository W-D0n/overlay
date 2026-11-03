// @ts-check
/**
 * Animated layer filters: the hue of a text is driven by two keyframes on the timeline, and the preview shows the CSS filter of the instant, on top of the
 * layer's own filters. A key put on a neutral filter changes nothing until it is set.
 */
import { openStudio } from '../studio.js';

export const name = 'filtres animés';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const filter = () => page.evaluate(`getComputedStyle(${CALQUE}).filter`);
  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(120);
  };

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);
  await page.fill('#filters-body [data-filter="brightness"] input[type="number"]', 1.5);
  await page.click('#timeline-toggle');

  const choices = await page.evaluate("[...document.querySelectorAll('#timeline-target option')].map((o) => o.value)");
  check('the timeline offers the five filter values', ['filter:brightness', 'filter:contrast', 'filter:saturation', 'filter:hue', 'filter:glow'].every((id) => choices.includes(id)) ? true : choices);

  await page.selectOption('#timeline-target', 'filter:hue');
  await seek(0);
  await page.click('#timeline-add-key');
  check('a key on the neutral hue changes nothing: the layer filter stays', (await filter()) === 'brightness(1.5)' ? true : await filter());
  await seek(1000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 90);
  await page.sleep(150);
  await seek(1000);
  check('at the last key the hue is turned, after the layer brightness', (await filter()) === 'brightness(1.5) hue-rotate(90deg)' ? true : await filter());
  await seek(500);
  const half = await filter();
  check('in between, the hue is half way', /hue-rotate\((4[3-7](\.\d+)?)deg\)/.test(half) ? true : half);
  await seek(0);
  check('back at the first key, the filter is the layer own again', (await filter()) === 'brightness(1.5)' ? true : await filter());

  await page.click('#layers-undo');
  await page.click('#layers-undo');
  check('undo takes the keys back', (await page.evaluate("document.querySelectorAll('.tl-track[data-target=\"filter:hue\"] .tl-key').length")) <= 1);
  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
}
