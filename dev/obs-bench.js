// @ts-check
/**
 * dev/obs-bench.js — Le banc de mesure du coût du rendu étendu (6d), à lancer **dans OBS** : une Browser Source qui charge
 * `dev/obs-bench.html` empile 8 effets pleine toile (le pire cas de l'étape 6) et enchaîne des scénarios, chacun ajoutant une
 * extension candidate (mode de fusion, rotation, flou, rognage…). Pour chacun, la page mesure le temps réel de chaque image et
 * affiche le résultat ; l'écart avec la base dit ce que l'extension coûte *dans OBS* (CEF, GPU et résolution de la source de
 * l'utilisateur), seule mesure qui compte avant d'exposer l'extension dans l'éditeur.
 *
 * `summarizeFrames` et `compareToBaseline` sont purs et testés ; le reste est du DOM et ne se teste que dans un navigateur.
 */

/** Les extensions candidates de 6d. `style` s'applique à chacun des calques de la pile. */
export const SCENARIOS = Object.freeze([
  { id: 'base', label: 'Base : 8 effets pleine toile', style: {} },
  { id: 'opacity', label: 'Opacité 50 % sur chaque couche', style: { opacity: '0.5' } },
  { id: 'blend-multiply', label: 'Fusion « produit »', style: { mixBlendMode: 'multiply' } },
  { id: 'blend-screen', label: 'Fusion « superposition claire »', style: { mixBlendMode: 'screen' } },
  { id: 'blend-overlay', label: 'Fusion « incrustation »', style: { mixBlendMode: 'overlay' } },
  { id: 'rotate', label: 'Rotation 3°', style: { transform: 'rotate(3deg) scale(1.06)' } },
  { id: 'crop', label: 'Rognage (inset 10 %)', style: { clipPath: 'inset(10%)' } },
  { id: 'blur-4', label: 'Flou 4 px', style: { filter: 'blur(4px)' } },
  { id: 'blur-12', label: 'Flou 12 px', style: { filter: 'blur(12px)' } },
  { id: 'combo', label: 'Fusion + rotation + flou 4 px', style: { mixBlendMode: 'screen', transform: 'rotate(3deg) scale(1.06)', filter: 'blur(4px)' } },
]);

/** Le budget d'une image à 60 images par seconde, en millisecondes. */
export const BUDGET_MS = 1000 / 60;

/**
 * Le résumé d'une série de durées entre images (ms).
 * @param {readonly number[]} deltas
 * @returns {{ frames: number, fps: number, meanMs: number, p95Ms: number, worstMs: number, overBudget: number, share: number }}
 */
export function summarizeFrames(deltas) {
  const valid = deltas.filter((delta) => Number.isFinite(delta) && delta > 0);
  if (valid.length === 0) return { frames: 0, fps: 0, meanMs: 0, p95Ms: 0, worstMs: 0, overBudget: 0, share: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const meanMs = valid.reduce((sum, delta) => sum + delta, 0) / valid.length;
  const overBudget = valid.filter((delta) => delta > BUDGET_MS * 1.5).length;
  return {
    frames: valid.length,
    fps: 1000 / meanMs,
    meanMs,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    worstMs: sorted[sorted.length - 1],
    overBudget,
    share: overBudget / valid.length,
  };
}

/**
 * Ce qu'une extension change par rapport à la base, et le verdict : « ok » (aucune différence perceptible), « à surveiller »,
 * « trop coûteux » (la scène ne tient plus 60 images par seconde ou perd plus de 20 % de ses images).
 * @param {ReturnType<typeof summarizeFrames>} base
 * @param {ReturnType<typeof summarizeFrames>} measured
 * @returns {{ deltaMs: number, deltaFps: number, verdict: 'ok' | 'watch' | 'too-costly' }}
 */
export function compareToBaseline(base, measured) {
  const deltaMs = measured.meanMs - base.meanMs;
  const deltaFps = measured.fps - base.fps;
  /** @type {'ok' | 'watch' | 'too-costly'} */
  let verdict = 'ok';
  if (measured.frames === 0) verdict = 'too-costly';
  else if (measured.fps < 45 || measured.share > 0.2 || deltaMs > BUDGET_MS * 0.5) verdict = 'too-costly';
  else if (measured.fps < 57 || measured.share > 0.05 || deltaMs > BUDGET_MS * 0.15) verdict = 'watch';
  return { deltaMs, deltaFps, verdict };
}

/** @param {ReturnType<typeof summarizeFrames>} summary @returns {string} */
export function formatSummary(summary) {
  if (summary.frames === 0) return 'aucune image mesurée';
  return `${summary.fps.toFixed(1)} i/s · moy. ${summary.meanMs.toFixed(1)} ms · p95 ${summary.p95Ms.toFixed(1)} ms · pire ${summary.worstMs.toFixed(0)} ms · ${(summary.share * 100).toFixed(1)} % d'images en retard`;
}

/**
 * Valide le rapport que la page envoie au serveur (pour qu'il puisse être relu sans recopier un tableau à l'écran).
 * @param {unknown} raw
 * @returns {{ ok: true, report: { at: string, env: string, results: { id: string, label: string, summary: ReturnType<typeof summarizeFrames>, verdict: string }[] } } | { ok: false, error: string }}
 */
export function validateBenchReport(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'rapport : objet attendu' };
  const body = /** @type {Record<string, unknown>} */ (raw);
  if (typeof body.env !== 'string' || body.env.length > 300) return { ok: false, error: 'rapport : environnement attendu' };
  if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > 30) return { ok: false, error: 'rapport : 1 à 30 résultats attendus' };
  const known = new Set(SCENARIOS.map(({ id }) => id));
  const numeric = ['frames', 'fps', 'meanMs', 'p95Ms', 'worstMs', 'overBudget', 'share'];
  const results = [];
  for (const entry of body.results) {
    const item = /** @type {Record<string, any>} */ (entry);
    if (typeof item !== 'object' || item === null || !known.has(item.id)) return { ok: false, error: `rapport : scénario inconnu ${String(item?.id)}` };
    if (typeof item.label !== 'string' || typeof item.summary !== 'object' || item.summary === null || numeric.some((key) => !Number.isFinite(item.summary[key]))) return { ok: false, error: `rapport : mesure invalide pour ${item.id}` };
    if (!['ok', 'watch', 'too-costly'].includes(item.verdict)) return { ok: false, error: `rapport : verdict invalide pour ${item.id}` };
    results.push({ id: item.id, label: item.label, summary: Object.fromEntries(numeric.map((key) => [key, item.summary[key]])), verdict: item.verdict });
  }
  return { ok: true, report: { at: new Date().toISOString(), env: body.env, results: /** @type {*} */ (results) } };
}
