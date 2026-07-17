// @ts-check

/**
 * Formate le plan métier pour l'étape de confirmation du tuner.
 * @param {{created:number,updated:number,renamed:number}} plan
 */
export function formatBackgroundPresetImportSummary(plan) {
  const createdLabel = plan.created > 1 ? 'nouveaux' : 'nouveau';
  const updatedLabel = plan.updated > 1 ? 'mises à jour' : 'mise à jour';
  const renamedLabel = plan.renamed > 1 ? 'noms ajustés' : 'nom ajusté';
  return `${plan.created} ${createdLabel} · ${plan.updated} ${updatedLabel} · ${plan.renamed} ${renamedLabel}`;
}
