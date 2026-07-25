// @ts-check
import { obsStatusMessage, sceneMapFromRows, sceneRows } from './obs-scene-map-presenter.js';

/**
 * dev/obs-scene-map-controller.js — Section « Scènes OBS » du tuner.
 *
 * Ne décide rien : les décisions d'affichage vivent dans `obs-scene-map-presenter.js` (pur, testé).
 * Ce module ne fait que peindre le DOM et relayer les enregistrements.
 * Voir docs/specs/obs-scene-preset-mapping.md.
 *
 * @param {{
 *   statusEl: HTMLElement,
 *   rowsEl: HTMLElement,
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

  function createSelect(row, presets) {
    const select = documentRef.createElement('select');
    const none = documentRef.createElement('option');
    none.value = '';
    none.textContent = '— aucun —';
    select.appendChild(none);

    for (const preset of presets) {
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
      const entry = rows.find(({ sceneName }) => sceneName === row.sceneName);
      if (entry !== undefined) entry.presetId = select.value === '' ? null : select.value;
    };
    return select;
  }

  function renderRows(displayRows, presets) {
    input.rowsEl.replaceChildren();
    for (const row of displayRows) {
      const container = documentRef.createElement('div');
      container.className = 'obs-scene-row';
      container.dataset.known = String(row.knownByObs);

      const name = documentRef.createElement('span');
      name.className = 'obs-scene-row-name';
      name.textContent = row.sceneName;
      container.appendChild(name);
      container.appendChild(createSelect(row, presets));

      if (row.missingPreset) {
        const warning = documentRef.createElement('span');
        warning.className = 'obs-scene-row-warning';
        warning.textContent = 'Preset associé introuvable — choisis-en un autre.';
        container.appendChild(warning);
      }
      input.rowsEl.appendChild(container);
    }
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
    const displayRows = sceneRows({ status, sceneMap, presets: state.presets });
    rows = displayRows.map(({ sceneName, presetId }) => ({ sceneName, presetId }));
    renderRows(displayRows, state.presets);
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

  return { refresh };
}
