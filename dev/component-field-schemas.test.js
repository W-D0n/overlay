// @ts-check
import { test, expect } from 'bun:test';
import {
  BACKGROUND_COMPONENT_NAMES,
  BACKGROUND_FIELD_SCHEMAS,
} from './component-field-schemas.js';
import { COMPONENT_NAMES } from '../component-names.js';

test('BACKGROUND_COMPONENT_NAMES equals COMPONENT_NAMES, no duplicate', () => {
  expect(new Set(BACKGROUND_COMPONENT_NAMES).size).toBe(BACKGROUND_COMPONENT_NAMES.length);
  expect(new Set(BACKGROUND_COMPONENT_NAMES)).toEqual(new Set(COMPONENT_NAMES));
});

test('les couleurs de fond utilisent les contrôles color/colors du tuner', () => {
  for (const fields of Object.values(BACKGROUND_FIELD_SCHEMAS)) {
    for (const field of fields) {
      if (/^color[A-Z]?$/.test(field.key)) expect(field.type).toBe('color');
    }
  }
  expect(BACKGROUND_FIELD_SCHEMAS.ColorDropsBackground.find(({ key }) => key === 'colors')?.type).toBe('colors');
});

test('DotGrid nomme son mode comme un profil de mouvement et l’explique', () => {
  const mode = BACKGROUND_FIELD_SCHEMAS.DotGridBackground.find(({ key }) => key === 'mode');
  expect(mode?.label).toBe('Profil de mouvement');
  expect(mode?.description).toContain('ne change pas la scène OBS');
});

test('chaque réglage numérique expose des bornes et un pas utilisables par un contrôle guidé', () => {
  const schemas = BACKGROUND_FIELD_SCHEMAS;
  for (const [component, fields] of Object.entries(schemas)) {
    for (const field of fields) {
      if (field.type !== 'number') continue;
      expect(Number.isFinite(field.min), `${component}.${field.key} min`).toBe(true);
      expect(Number.isFinite(field.max), `${component}.${field.key} max`).toBe(true);
      expect(Number.isFinite(field.step), `${component}.${field.key} step`).toBe(true);
      expect(field.max).toBeGreaterThan(field.min);
      expect(field.step).toBeGreaterThan(0);
      expect(field.default).toBeGreaterThanOrEqual(field.min);
      expect(field.default).toBeLessThanOrEqual(field.max);
      expect(field.control).toBe('slider');
    }
  }
});
