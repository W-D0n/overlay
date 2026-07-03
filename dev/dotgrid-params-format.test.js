// @ts-check
import { test, expect } from 'bun:test';
import { formatModeParamsBlock, applyDotGridParamsToSource } from './dotgrid-params-format.js';

const FIXTURE_SOURCE = `// @ts-check
export const MODE_PARAMS = {
  discussion: { freqX: 0.03, freqY: 0.03, freqT: 0.7, amplitude: 0.16 },
  codage:     { freqX: 0.01, freqY: 0.01, freqT: 0.2, amplitude: 0.06 },
};

export function DotGridAnimated(options = {}) {
  const spacing     = options.spacing     ?? 20;
  const dotRadius   = options.dotRadius   ?? 1.3;
  const baseColor   = options.baseColor   ?? [200, 185, 122];
  const baseOpacity = options.baseOpacity ?? 0.26;
  return {};
}
`;

test('formatModeParamsBlock generates one aligned entry per mode in the given order', () => {
  const block = formatModeParamsBlock(
    { discussion: { freqX: 0.03, freqY: 0.03, freqT: 0.7, amplitude: 0.16 } },
    ['discussion'],
  );
  expect(block).toBe('export const MODE_PARAMS = {\n  discussion: { freqX: 0.03, freqY: 0.03, freqT: 0.7, amplitude: 0.16 },\n};');
});

test('applyDotGridParamsToSource replaces MODE_PARAMS, dotRadius and baseOpacity, preserves the rest', () => {
  const updated = applyDotGridParamsToSource(FIXTURE_SOURCE, {
    modeParams: { discussion: { freqX: 0.05, freqY: 0.05, freqT: 1.0, amplitude: 0.2 } },
    order: ['discussion'],
    baseOpacity: 0.4,
    dotRadius: 2,
  });

  expect(updated).toContain('discussion: { freqX: 0.05, freqY: 0.05, freqT: 1, amplitude: 0.2 },');
  expect(updated).toContain('const dotRadius   = options.dotRadius   ?? 2;');
  expect(updated).toContain('const baseOpacity = options.baseOpacity ?? 0.4;');
  expect(updated).toContain('const spacing     = options.spacing     ?? 20;'); // reste inchangé
  expect(updated).toContain('// @ts-check'); // reste inchangé
});

test('applyDotGridParamsToSource throws if the MODE_PARAMS block is not found', () => {
  expect(() => applyDotGridParamsToSource('const x = 1;', {
    modeParams: {}, order: [], baseOpacity: 0.2, dotRadius: 1,
  })).toThrow();
});

test('applyDotGridParamsToSource does not mutate the input string', () => {
  const before = FIXTURE_SOURCE;
  applyDotGridParamsToSource(FIXTURE_SOURCE, {
    modeParams: { discussion: { freqX: 0.05, freqY: 0.05, freqT: 1.0, amplitude: 0.2 } },
    order: ['discussion'],
    baseOpacity: 0.4,
    dotRadius: 2,
  });
  expect(FIXTURE_SOURCE).toBe(before);
});
