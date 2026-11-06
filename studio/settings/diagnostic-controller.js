// @ts-check
import { diagnose, diagnosticReport, diagnosticSummary, outdatedServerChecks } from './diagnostics.js';

const POLL_INTERVAL_MS = 5000;
const MARKS = { ok: '●', warn: '!', bad: '×', off: '○' };

/**
 * Panneau « Diagnostic » du Studio : le détail de la chaîne jusqu'à OBS, avec pour chaque défaut le geste qui le
 * corrige. Relu à l'ouverture, au clic sur « Revérifier » et toutes les 5 secondes tant que le panneau est ouvert.
 * Les constats viennent de `diagnostics.js` ; ce module peint le DOM.
 *
 * @param {{
 *   dialog: HTMLDialogElement,
 *   openButton: HTMLButtonElement,
 *   closeButton: HTMLButtonElement,
 *   refreshButton: HTMLButtonElement,
 *   copyButton: HTMLButtonElement,
 *   summary: HTMLElement,
 *   list: HTMLElement,
 *   client: {
 *     readDiagnostics(): Promise<*>,
 *     readObsStatus(): Promise<*>,
 *   },
 *   documentRef?: Document,
 *   navigatorRef?: Navigator,
 *   windowRef?: Window,
 *   intervalMs?: number,
 * }} input
 */
export function createDiagnosticController(input) {
  const documentRef = input.documentRef ?? document;
  const navigatorRef = input.navigatorRef ?? navigator;
  const windowRef = input.windowRef ?? window;

  /** @type {import('./diagnostics.js').Check[]} */
  let checks = [];
  /** @type {number | null} */
  let timer = null;

  async function readChecks() {
    const facts = await input.client.readDiagnostics().catch(() => null);
    if (facts !== null) {
      return diagnose({
        serverReachable: true,
        obs: facts.obs,
        inspection: facts.inspection,
        inspectionError: facts.inspectionError,
        renderPages: facts.renderPages,
        staticPort: facts.staticPort,
        sceneMap: facts.sceneMap,
        ...(facts.assetUse === undefined ? {} : { assetUse: facts.assetUse }),
      });
    }
    const alive = await input.client.readObsStatus().then(() => true, () => false);
    return alive
      ? outdatedServerChecks()
      : diagnose({ serverReachable: false, obs: null, inspection: null, inspectionError: null, renderPages: null, staticPort: 0, sceneMap: {} });
  }

  async function refresh() {
    input.refreshButton.disabled = true;
    checks = await readChecks();
    input.refreshButton.disabled = false;
    const summary = diagnosticSummary(checks);
    input.summary.textContent = summary.text;
    input.dialog.dataset.tone = summary.tone;
    input.list.replaceChildren(...checks.map(renderCheck));
  }

  /** @param {import('./diagnostics.js').Check} check */
  function renderCheck(check) {
    const row = documentRef.createElement('li');
    row.className = 'diagnostic-check';
    row.dataset.tone = check.tone;
    const mark = documentRef.createElement('span');
    mark.className = 'diagnostic-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = MARKS[check.tone];
    const head = documentRef.createElement('div');
    head.className = 'diagnostic-head';
    const label = documentRef.createElement('strong');
    label.textContent = check.label;
    const short = documentRef.createElement('span');
    short.className = 'diagnostic-short';
    short.textContent = check.short;
    head.append(label, short);
    const detail = documentRef.createElement('p');
    detail.textContent = check.detail;
    const body = documentRef.createElement('div');
    body.append(head, detail);
    if (check.fix !== null) {
      const fix = documentRef.createElement('p');
      fix.className = 'diagnostic-fix';
      fix.textContent = check.fix;
      body.append(fix);
    }
    row.append(mark, body);
    return row;
  }

  function stopPolling() {
    if (timer !== null) windowRef.clearInterval(timer);
    timer = null;
  }

  function open() {
    if (!input.dialog.open) input.dialog.showModal();
    refresh();
    stopPolling();
    timer = windowRef.setInterval(() => { if (!documentRef.hidden) refresh(); }, input.intervalMs ?? POLL_INTERVAL_MS);
  }

  input.openButton.onclick = open;
  input.closeButton.onclick = () => input.dialog.close();
  input.refreshButton.onclick = () => { refresh(); };
  input.dialog.addEventListener('close', stopPolling);
  input.copyButton.onclick = async () => {
    await navigatorRef.clipboard.writeText(diagnosticReport(checks));
    input.copyButton.textContent = 'Rapport copié';
    windowRef.setTimeout(() => { input.copyButton.textContent = 'Copier le rapport'; }, 1200);
  };

  return {
    refresh,
    open,
    destroy() {
      stopPolling();
      if (input.dialog.open) input.dialog.close();
    },
  };
}
