import { expect, test } from 'bun:test';
import { compareToBaseline, countErrorsByFile } from './typecheck-baseline.js';

test('les erreurs de tsc sont comptées par fichier, quel que soit le séparateur de chemin', () => {
  const output = [
    "dev/a.js(3,5): error TS2339: Property 'x' does not exist on type 'Y'.",
    'dev\\a.js(9,1): error TS7006: Parameter implicitly has an any type.',
    "components/b.js(1,1): error TS2322: Type 'a' is not assignable to type 'b'.",
    '  continuation line',
  ].join('\r\n');
  expect(countErrorsByFile(output)).toEqual({ 'dev/a.js': 2, 'components/b.js': 1 });
});

test('un fichier qui gagne des erreurs, ou un nouveau fichier fautif, est une régression', () => {
  const { regressions, improvements } = compareToBaseline(
    { 'a.js': 3, 'b.js': 1, 'new.js': 2 },
    { 'a.js': 2, 'b.js': 1, 'gone.js': 4 },
  );
  expect(regressions).toEqual(['a.js : 2 → 3 erreur(s)', 'new.js : 0 → 2 erreur(s)']);
  expect(improvements).toEqual(['gone.js : 4 → 0 erreur(s)']);
});

test('un résultat identique ou meilleur ne produit aucune régression', () => {
  expect(compareToBaseline({ 'a.js': 1 }, { 'a.js': 2 }).regressions).toEqual([]);
  expect(compareToBaseline({}, {}).regressions).toEqual([]);
});
