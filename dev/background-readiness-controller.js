// @ts-check
import { collectBackgroundLiveReadiness } from './background-live-readiness.js';

/**
 * @param {number} count
 * @param {number} stepMs
 * @param {boolean} reducedMotion
 */
export function readinessRevealDelays(count, stepMs, reducedMotion) {
  return Array.from(
    { length: Math.max(0, count) },
    (_, index) => reducedMotion ? 0 : index * stepMs,
  );
}

const READINESS_COPY = {
  ready: {
    title: 'Prêt pour le live',
    summary: 'Les points vérifiables automatiquement sont prêts. Confirme le rendu dans OBS.',
  },
  attention: {
    title: 'À vérifier',
    summary: 'Le fond peut fonctionner, mais un point mérite ton attention avant le live.',
  },
  blocking: {
    title: 'À corriger',
    summary: 'Un point empêche de préparer une URL OBS fiable.',
  },
};

/** @param {string} value */
function cssTimeToMs(value) {
  const normalized = value.trim();
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 90;
  return normalized.endsWith('s') && !normalized.endsWith('ms') ? amount * 1000 : amount;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   title: HTMLElement,
 *   summary: HTMLElement,
 *   checks: HTMLElement,
 *   runButton: HTMLButtonElement,
 *   stateServer: string,
 *   getSelection: () => { presetId: string | null, quality: 'auto' | 'performance' },
 *   getRuntime: () => { fps: number | null, pixelRatio: number | null, paused: boolean },
 *   focusEffect: () => void,
 *   focusPresets: () => void,
 *   documentRef?: Document,
 *   navigatorRef?: Navigator,
 *   windowRef?: Window,
 *   collect?: typeof collectBackgroundLiveReadiness,
 * }} input
 */
export function createBackgroundReadinessController(input) {
  const documentRef = input.documentRef ?? document;
  const navigatorRef = input.navigatorRef ?? navigator;
  const windowRef = input.windowRef ?? window;
  const collect = input.collect ?? collectBackgroundLiveReadiness;

  async function runAction(action, button) {
    if (typeof action.value === 'string') {
      await navigatorRef.clipboard.writeText(action.value);
      button.textContent = 'URL copiée';
      return;
    }
    if (action.type === 'retry') {
      run();
      return;
    }
    if (action.type === 'focus-effect') {
      input.focusEffect();
      return;
    }
    if (action.type === 'focus-presets') input.focusPresets();
  }

  function render(report) {
    const copy = READINESS_COPY[report.status];
    input.root.dataset.status = report.status;
    input.title.textContent = copy.title;
    input.summary.textContent = copy.summary;
    input.checks.replaceChildren();

    const reducedMotion = windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepMs = cssTimeToMs(
      windowRef.getComputedStyle(documentRef.documentElement)
        .getPropertyValue('--transition-stagger'),
    );
    const delays = readinessRevealDelays(report.checks.length, stepMs, reducedMotion);
    const marks = { ready: '✓', attention: '!', blocking: '×' };

    report.checks.forEach((check, index) => {
      const item = documentRef.createElement('article');
      item.className = 'readiness-check';
      item.dataset.status = check.status;
      if (!reducedMotion) {
        item.classList.add('is-revealing');
        item.style.animationDelay = `${delays[index]}ms`;
      }

      const mark = documentRef.createElement('span');
      mark.className = 'readiness-check-mark';
      mark.textContent = marks[check.status];
      mark.setAttribute('aria-hidden', 'true');

      const content = documentRef.createElement('div');
      const title = documentRef.createElement('div');
      title.className = 'readiness-check-title';
      title.textContent = check.title;
      const detail = documentRef.createElement('p');
      detail.className = 'readiness-check-detail';
      detail.textContent = check.detail;
      content.append(title, detail);
      item.append(mark, content);

      if (check.action) {
        const action = documentRef.createElement('button');
        action.className = 'readiness-check-action';
        action.type = 'button';
        action.textContent = check.action.label;
        action.onclick = () => runAction(check.action, action);
        item.appendChild(action);
      }
      input.checks.appendChild(item);
    });
  }

  async function run() {
    input.root.setAttribute('aria-busy', 'true');
    input.runButton.disabled = true;
    input.runButton.textContent = 'Vérification…';
    input.title.textContent = 'Vérification…';
    input.summary.textContent = 'Lecture des services et du rendu en cours.';
    try {
      const report = await collect({
        stateServer: input.stateServer,
        selection: input.getSelection(),
        runtime: input.getRuntime(),
      });
      render(report);
    } finally {
      input.root.removeAttribute('aria-busy');
      input.runButton.disabled = false;
      input.runButton.textContent = 'Revérifier';
    }
  }

  input.runButton.onclick = run;
  return { run };
}
