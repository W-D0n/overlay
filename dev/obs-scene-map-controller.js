// @ts-check
import { filterSceneRows, obsStatusMessage, partitionSceneRows, sceneMapFromRows, sceneRows } from './obs-scene-map-presenter.js';

/**
 * dev/obs-scene-map-controller.js — Section « Scènes OBS » du tuner.
 *
 * Ne décide rien : les décisions d'affichage (ordre, filtre, repli) vivent dans
 * `obs-scene-map-presenter.js` (pur, testé). Ce module ne fait que peindre le DOM et relayer les
 * enregistrements.
 * Voir docs/specs/obs-scene-preset-mapping.md.
 *
 * @param {{
 *   statusEl: HTMLElement,
 *   rowsEl: HTMLElement,
 *   filterEl: HTMLInputElement,
 *   saveButton: HTMLButtonElement,
 *   refreshButton: HTMLButtonElement,
 *   documentRef: Document,
 *   client: { readObsStatus(): Promise<*>, readState(): Promise<*>, saveSceneMap(map: Record<string, string>): Promise<*> },
 *   report: { ok(message?: string): void, error(message: string): void },
 * }} input
 */
export function createObsSceneMapController(input) {
  const { documentRef } = input;
  /** @type {{ sceneName: string, presetId: string | null }[]} */
  let rows = [];
  /** @type {import('./obs-scene-map-presenter.js').SceneRow[]} */
  let displayRows = [];
  /** @type {{ id: string, name: string }[]} */
  let knownPresets = [];

  /** @param {import('./obs-scene-map-presenter.js').SceneRow} row */
  function presetLabel(row) {
    if (row.presetId === null) return 'Associer…';
    const preset = knownPresets.find(({ id }) => id === row.presetId);
    return preset?.name ?? `${row.presetId} (introuvable)`;
  }

  /** @param {import('./obs-scene-map-presenter.js').SceneRow} row */
  function createSelect(row) {
    const select = documentRef.createElement('select');
    const none = documentRef.createElement('option');
    none.value = '';
    none.textContent = '— aucun —';
    select.appendChild(none);

    for (const preset of knownPresets) {
      const option = documentRef.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      select.appendChild(option);
    }

    // Un preset supprimé n'existe plus dans la liste : on ajoute son identifiant tel quel pour que
    // la ligne reste sélectionnable et corrigeable au lieu de retomber silencieusement sur « aucun ».
    if (row.missingPreset && row.presetId !== null) {
      const orphan = documentRef.createElement('option');
      orphan.value = row.presetId;
      orphan.textContent = `${row.presetId} (introuvable)`;
      select.appendChild(orphan);
    }

    select.value = row.presetId ?? '';
    select.onchange = () => {
      const presetId = select.value === '' ? null : select.value;
      const entry = rows.find(({ sceneName }) => sceneName === row.sceneName);
      if (entry !== undefined) entry.presetId = presetId;
      row.presetId = presetId;
      row.missingPreset = false;
      renderRows();
    };
    select.onblur = () => { renderRows(); };
    return select;
  }

  /** @param {import('./obs-scene-map-presenter.js').SceneRow} row */
  function createRow(row) {
    const container = documentRef.createElement('div');
    container.className = 'obs-scene-row';
    container.dataset.known = String(row.knownByObs);
    container.dataset.active = String(row.active);

    const name = documentRef.createElement('span');
    name.className = 'obs-scene-row-name';
    name.textContent = row.sceneName;
    container.appendChild(name);

    const choose = documentRef.createElement('button');
    choose.type = 'button';
    choose.className = 'obs-scene-row-preset';
    choose.dataset.empty = String(row.presetId === null);
    choose.textContent = presetLabel(row);
    choose.onclick = () => {
      const select = createSelect(row);
      choose.replaceWith(select);
      select.focus();
    };
    container.appendChild(choose);

    if (row.missingPreset) {
      const warning = documentRef.createElement('span');
      warning.className = 'obs-scene-row-warning';
      warning.textContent = 'Preset associé introuvable — choisis-en un autre.';
      container.appendChild(warning);
    }
    return container;
  }

  function renderRows() {
    input.rowsEl.replaceChildren();
    const filtering = input.filterEl.value.trim() !== '';
    const visible = filterSceneRows(displayRows, input.filterEl.value);

    if (filtering) {
      for (const row of visible) input.rowsEl.appendChild(createRow(row));
      if (visible.length === 0) {
        const empty = documentRef.createElement('p');
        empty.className = 'hint';
        empty.textContent = 'Aucune scène ne correspond.';
        input.rowsEl.appendChild(empty);
      }
      return;
    }

    const { shown, folded } = partitionSceneRows(visible);
    for (const row of shown) input.rowsEl.appendChild(createRow(row));
    if (folded.length === 0) return;

    const details = documentRef.createElement('details');
    details.className = 'obs-scene-folded';
    const summary = documentRef.createElement('summary');
    summary.textContent = `${folded.length} sans preset`;
    details.appendChild(summary);
    for (const row of folded) details.appendChild(createRow(row));
    input.rowsEl.appendChild(details);
  }

  async function refresh() {
    let status;
    let state;
    try {
      [status, state] = await Promise.all([input.client.readObsStatus(), input.client.readState()]);
    } catch (error) {
      input.report.error(`OBS : ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const message = obsStatusMessage(status);
    input.statusEl.textContent = message.text;
    input.statusEl.dataset.tone = message.tone;

    const sceneMap = state.sceneMap ?? {};
    displayRows = sceneRows({ status, sceneMap, presets: state.presets });
    knownPresets = state.presets;
    rows = displayRows.map(({ sceneName, presetId }) => ({ sceneName, presetId }));
    renderRows();
    input.saveButton.disabled = displayRows.length === 0;
  }

  input.saveButton.onclick = async () => {
    try {
      await input.client.saveSceneMap(sceneMapFromRows(rows));
      input.report.ok('associations de scènes enregistrées');
      await refresh();
    } catch (error) {
      input.report.error(`scene-map : ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  input.refreshButton.onclick = () => { refresh(); };
  input.filterEl.oninput = () => { renderRows(); };

  return { refresh };
}
