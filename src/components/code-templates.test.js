import { describe, expect, test } from 'bun:test';
import { CODE_MAX_CHARS, CODE_PARAMS_MAX_CHARS } from '../layers/layer-kinds.js';
import { validateSceneDoc } from '../scene/scene-doc.js';
import { parseParamSpec } from './code-params.js';
import { CODE_TEMPLATES } from './code-templates.js';

describe('code templates', () => {
  test('there are some, with unique identifiers and labels', () => {
    expect(CODE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(CODE_TEMPLATES.map(({ id }) => id)).size).toBe(CODE_TEMPLATES.length);
    expect(new Set(CODE_TEMPLATES.map(({ label }) => label)).size).toBe(CODE_TEMPLATES.length);
  });

  for (const template of CODE_TEMPLATES) {
    describe(template.id, () => {
      test('fits the limits of a Code layer', () => {
        for (const key of ['html', 'css', 'js']) expect(template[key].length).toBeLessThanOrEqual(CODE_MAX_CHARS);
        expect(template.paramSpec.length).toBeLessThanOrEqual(CODE_PARAMS_MAX_CHARS);
        expect(template.label.trim()).not.toBe('');
        expect(template.description.trim()).not.toBe('');
      });

      test('declares valid settings, without a single defect', () => {
        const { params, errors } = parseParamSpec(template.paramSpec);
        expect(errors).toEqual([]);
        expect(params.length).toBeGreaterThan(0);
      });

      test('the script is valid JavaScript', () => {
        expect(() => new Function(template.js)).not.toThrow();
      });

      test('uses only the settings it declares, in the CSS and in the script', () => {
        const declared = new Set(parseParamSpec(template.paramSpec).params.map(({ key }) => key));
        const used = [
          ...[...template.css.matchAll(/--param-([a-zA-Z0-9_]+)/g)].map((match) => match[1]),
          ...[...template.js.matchAll(/overlay\.params\.([a-zA-Z0-9_]+)/g)].map((match) => match[1]),
        ];
        for (const key of used) expect(declared.has(key)).toBe(true);
      });

      test('every declared setting is used somewhere', () => {
        const source = `${template.html}\n${template.css}\n${template.js}`;
        for (const { key } of parseParamSpec(template.paramSpec).params) {
          expect(source.includes(`--param-${key}`) || source.includes(`overlay.params.${key}`)).toBe(true);
        }
      });

      test('has no import, nor an external address: it runs as it is in the isolated page', () => {
        expect(template.js).not.toMatch(/^\s*import\s/m);
        expect(`${template.html}${template.css}${template.js}`).not.toMatch(/https?:\/\//);
      });

      test('makes a valid Code layer in a scene', () => {
        const layer = { id: 'c', kind: 'code', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { html: template.html, css: template.css, js: template.js, paramSpec: template.paramSpec, params: {}, audioReactive: false } };
        expect(validateSceneDoc({ version: 1, id: 's', name: 's', layers: [layer] }).ok).toBe(true);
      });
    });
  }
});
