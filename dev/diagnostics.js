// @ts-check
/**
 * dev/diagnostics.js — Le diagnostic de la chaîne Studio → serveur → OBS → page de rendu.
 *
 * Logique pure : chaque contrôle répond à une question précise à partir de lectures déjà faites (état du serveur,
 * photographie d'OBS de `obs-inspector.js`, table scène → preset). Un contrôle porte son constat, et quand il est
 * en défaut, le geste qui le corrige. Le bandeau « Antenne » reste le résumé permanent ; ceci en est le détail.
 *
 * @typedef {'ok' | 'warn' | 'bad' | 'off'} CheckTone
 * @typedef {{ id: string, label: string, tone: CheckTone, short: string, detail: string, fix: string | null }} Check
 * @typedef {import('./obs-inspector.js').ObsInspection} ObsInspection
 * @typedef {{ connected: boolean, configured: boolean, reason: string | null, scenes: string[], activeScene: string | null }} ObsState
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * @param {string | null} url
 * @param {number} staticPort
 * @returns {'match' | 'wrong-port' | 'other'} `wrong-port` : c'est bien notre page de fond, mais pas servie par ce serveur.
 */
export function backgroundSourceKind(url, staticPort) {
  if (url === null) return 'other';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'other';
  }
  if (parsed.pathname !== '/background.html') return 'other';
  const port = parsed.port === '' ? (parsed.protocol === 'https:' ? 443 : 80) : Number(parsed.port);
  return LOCAL_HOSTS.has(parsed.hostname) && port === staticPort ? 'match' : 'wrong-port';
}

/** @param {string[]} names */
function quoted(names) {
  return names.map((name) => `« ${name} »`).join(', ');
}

/**
 * @param {{
 *   serverReachable: boolean,
 *   obs: ObsState | null,
 *   inspection: ObsInspection | null,
 *   inspectionError: string | null,
 *   renderPages: number | null,
 *   staticPort: number,
 *   sceneMap: Record<string, string>,
 * }} input
 * @returns {Check[]}
 */
export function diagnose(input) {
  /** @type {Check[]} */
  const checks = [serverCheck(input)];
  if (!input.serverReachable) return checks;

  const obsCheck = obsConnectionCheck(input);
  checks.push(obsCheck);
  const inspection = obsCheck.tone === 'ok' ? input.inspection : null;
  const dependsOnObs = (/** @type {string} */ id, /** @type {string} */ label) => ({
    id, label, tone: /** @type {CheckTone} */ ('off'), short: 'en attente d’OBS', detail: 'dépend de la connexion à OBS', fix: null,
  });

  if (inspection === null) {
    const unreadable = obsCheck.tone === 'ok';
    const reading = (/** @type {string} */ id, /** @type {string} */ label) => unreadable
      ? { id, label, tone: /** @type {CheckTone} */ ('warn'), short: 'illisible', detail: `OBS est connecté mais n’a pas répondu : ${input.inspectionError ?? 'inconnu'}`, fix: 'Revérifier dans quelques secondes.' }
      : dependsOnObs(id, label);
    checks.push(reading('source', 'Source navigateur dans OBS'), reading('scene', 'Scène active'));
  } else {
    const source = sourceCheck(input, inspection);
    checks.push(source, sceneCheck(input, inspection, source.tone !== 'bad'));
  }
  checks.push(renderCheck(input, inspection));
  checks.push(mappingCheck(input));
  return checks;
}

/** @param {{ serverReachable: boolean }} input @returns {Check} */
function serverCheck({ serverReachable }) {
  return serverReachable
    ? { id: 'server', label: 'Serveurs', tone: 'ok', short: 'en marche', detail: 'Le serveur d’état répond.', fix: null }
    : { id: 'server', label: 'Serveurs', tone: 'bad', short: 'injoignable', detail: 'Le serveur d’état ne répond pas.', fix: 'Lance les serveurs (menu Serveurs de l’application, ou start-stream.bat).' };
}

/** @param {{ obs: ObsState | null }} input @returns {Check} */
function obsConnectionCheck({ obs }) {
  const label = 'Connexion à OBS';
  if (obs === null || !obs.configured) {
    return { id: 'obs', label, tone: 'off', short: 'non configurée', detail: 'Aucun mot de passe OBS n’est renseigné : le Studio ne peut ni suivre les scènes ni inspecter OBS.', fix: 'Renseigne OBS_WS_PASSWORD dans .env (OBS > Outils > Paramètres du serveur WebSocket), puis redémarre les serveurs.' };
  }
  if (obs.connected) return { id: 'obs', label, tone: 'ok', short: 'connecté', detail: 'Connecté à OBS (WebSocket).', fix: null };
  if (obs.reason === 'auth-rejected') {
    return { id: 'obs', label, tone: 'bad', short: 'mot de passe refusé', detail: 'OBS a refusé le mot de passe.', fix: 'Corrige OBS_WS_PASSWORD dans .env pour qu’il corresponde à celui d’OBS, puis redémarre les serveurs.' };
  }
  return { id: 'obs', label, tone: 'warn', short: 'injoignable', detail: 'OBS ne répond pas sur son port WebSocket.', fix: 'Ouvre OBS et active le serveur WebSocket (Outils > Paramètres du serveur WebSocket). La connexion se rétablit seule.' };
}

/** @param {{ staticPort: number }} input @param {ObsInspection} inspection @returns {Check} */
function sourceCheck({ staticPort }, inspection) {
  const label = 'Source navigateur dans OBS';
  const expected = `http://localhost:${staticPort}/background.html`;
  const matches = inspection.browserSources.filter(({ url }) => backgroundSourceKind(url, staticPort) === 'match');
  const wrongPort = inspection.browserSources.filter(({ url }) => backgroundSourceKind(url, staticPort) === 'wrong-port');
  if (matches.length > 0 && wrongPort.length > 0) {
    return { id: 'source', label, tone: 'warn', short: `${wrongPort.length} mauvais port`, detail: `${quoted(matches.map(({ name }) => name))} pointe vers ce serveur, mais ${quoted(wrongPort.map(({ name }) => name))} pointe ailleurs (${wrongPort[0].url}).`, fix: `Dans OBS, propriétés de ${quoted(wrongPort.map(({ name }) => name))} : mets l’URL ${expected} (en gardant les paramètres de la source).` };
  }
  if (matches.length > 0) {
    return { id: 'source', label, tone: 'ok', short: matches.length === 1 ? matches[0].name : `${matches.length} sources`, detail: `${quoted(matches.map(({ name }) => name))} pointe vers ce serveur.`, fix: null };
  }
  if (wrongPort.length > 0) {
    return { id: 'source', label, tone: 'bad', short: 'mauvais port', detail: `${quoted(wrongPort.map(({ name }) => name))} affiche le fond mais ne pointe pas vers ce serveur (${wrongPort[0].url}).`, fix: `Dans OBS, propriétés de la source : mets l’URL ${expected}.` };
  }
  return { id: 'source', label, tone: 'bad', short: 'aucune', detail: 'Aucune source navigateur d’OBS n’affiche le fond.', fix: `Ajoute une source Navigateur dans OBS avec l’URL du bouton « Copier l’URL OBS » (${expected}).` };
}

/**
 * @param {{ obs: ObsState | null, staticPort: number }} input
 * @param {ObsInspection} inspection
 * @param {boolean} hasSource
 * @returns {Check}
 */
function sceneCheck({ obs, staticPort }, inspection, hasSource) {
  const label = 'Scène active';
  const active = obs?.activeScene ?? null;
  if (active === null) return { id: 'scene', label, tone: 'off', short: 'inconnue', detail: 'OBS n’a pas indiqué sa scène active.', fix: null };
  if (!hasSource) return { id: 'scene', label, tone: 'off', short: active, detail: `Scène « ${active} » (aucune source à y chercher).`, fix: null };
  const matchNames = inspection.browserSources.filter(({ url }) => backgroundSourceKind(url, staticPort) === 'match').map(({ name }) => name);
  const content = inspection.scenes.find(({ name }) => name === active);
  const present = (content?.browserSources ?? []).filter(({ name }) => matchNames.includes(name));
  if (present.some(({ enabled }) => enabled)) return { id: 'scene', label, tone: 'ok', short: active, detail: `La scène « ${active} » affiche le fond.`, fix: null };
  if (present.length > 0) {
    return { id: 'scene', label, tone: 'warn', short: 'fond masqué', detail: `La source ${quoted(present.map(({ name }) => name))} est dans « ${active} » mais masquée.`, fix: 'Rends la source visible dans OBS (œil de la liste des sources).' };
  }
  return { id: 'scene', label, tone: 'warn', short: 'sans fond', detail: `La scène « ${active} » n’affiche pas le fond. Normal si cette scène n’en veut pas.`, fix: `Pour l’afficher, ajoute la source ${quoted(matchNames.slice(0, 1))} à cette scène.` };
}

/**
 * @param {{ renderPages: number | null, obs: ObsState | null, staticPort: number }} input
 * @param {ObsInspection | null} inspection
 * @returns {Check}
 */
function renderCheck({ renderPages, obs, staticPort }, inspection) {
  const label = 'Page de rendu';
  if (renderPages === null) return { id: 'render', label, tone: 'off', short: 'indisponible', detail: 'Le serveur ne sait pas compter les pages de rendu : il date d’avant cette fonction.', fix: 'Redémarre les serveurs.' };
  if (renderPages > 0) return { id: 'render', label, tone: 'ok', short: String(renderPages), detail: renderPages === 1 ? 'Une page de rendu est connectée.' : `${renderPages} pages de rendu sont connectées.`, fix: null };
  const active = obs?.activeScene ?? null;
  const shown = active !== null && (inspection?.scenes.find(({ name }) => name === active)?.browserSources ?? [])
    .some(({ name, enabled }) => enabled && backgroundSourceKind(inspection?.browserSources.find((source) => source.name === name)?.url ?? null, staticPort) === 'match');
  if (inspection !== null && !shown) {
    return { id: 'render', label, tone: 'off', short: 'aucune', detail: 'Aucune page connectée, ce qui est normal : la scène active n’affiche pas le fond.', fix: null };
  }
  return { id: 'render', label, tone: 'warn', short: 'aucune', detail: 'Aucune page de rendu n’est connectée.', fix: 'Dans OBS, propriétés de la source navigateur > « Actualiser le cache de la page actuelle ».' };
}

/** @param {{ obs: ObsState | null, sceneMap: Record<string, string> }} input @returns {Check} */
function mappingCheck({ obs, sceneMap }) {
  const label = 'Scènes associées';
  const mapped = Object.keys(sceneMap);
  if (mapped.length === 0) return { id: 'mapping', label, tone: 'off', short: 'aucune', detail: 'Aucune scène OBS n’est associée à un preset : le fond ne change pas avec la scène.', fix: null };
  if (obs === null || !obs.connected) return { id: 'mapping', label, tone: 'off', short: `${mapped.length} associée${mapped.length > 1 ? 's' : ''}`, detail: 'Comparaison avec OBS impossible tant qu’OBS n’est pas connecté.', fix: null };
  const orphans = mapped.filter((name) => !obs.scenes.includes(name));
  if (orphans.length > 0) {
    return { id: 'mapping', label, tone: 'warn', short: `${orphans.length} introuvable${orphans.length > 1 ? 's' : ''}`, detail: `Associées mais absentes d’OBS : ${quoted(orphans)}. La scène a peut-être été renommée ou supprimée.`, fix: 'Dans « Scènes OBS », réassocie le preset à la scène renommée.' };
  }
  return { id: 'mapping', label, tone: 'ok', short: `${mapped.length}/${obs.scenes.length}`, detail: `${mapped.length} scène${mapped.length > 1 ? 's' : ''} sur ${obs.scenes.length} associée${mapped.length > 1 ? 's' : ''} à un preset, toutes présentes dans OBS.`, fix: null };
}

/**
 * Rapport texte copiable, pour un message d’aide ou un journal.
 * @param {Check[]} checks
 * @returns {string}
 */
export function diagnosticReport(checks) {
  const marks = { ok: 'OK', warn: 'A VERIFIER', bad: 'ERREUR', off: 'INFO' };
  return checks
    .map((check) => `[${marks[check.tone]}] ${check.label} — ${check.detail}${check.fix === null ? '' : `\n    → ${check.fix}`}`)
    .join('\n');
}

/**
 * Serveur qui répond mais ne connaît pas `/diagnostics` (lancé avant cette fonction).
 * @returns {Check[]}
 */
export function outdatedServerChecks() {
  return [{
    id: 'server', label: 'Serveurs', tone: 'warn', short: 'trop ancien',
    detail: 'Le serveur d’état répond mais date d’avant le diagnostic : il ne peut pas inspecter OBS.',
    fix: 'Redémarre les serveurs (menu Serveurs).',
  }];
}

/**
 * Pire constat des contrôles ; un contrôle « off » (non configuré, sans objet) ne dégrade pas l'ensemble.
 * @param {Check[]} checks
 * @returns {{ tone: 'ok' | 'warn' | 'bad', text: string }}
 */
export function diagnosticSummary(checks) {
  const bad = checks.filter(({ tone }) => tone === 'bad').length;
  const warn = checks.filter(({ tone }) => tone === 'warn').length;
  if (bad > 0) return { tone: 'bad', text: bad === 1 ? '1 point à corriger' : `${bad} points à corriger` };
  if (warn > 0) return { tone: 'warn', text: warn === 1 ? '1 point à vérifier' : `${warn} points à vérifier` };
  return { tone: 'ok', text: 'Tout est en ordre' };
}
