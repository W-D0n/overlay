import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/** Les textes que lit l'utilisateur dans le Studio : contenu des balises et attributs lus à l'écran ou par un lecteur d'écran. */
function visibleTexts(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const texts = [...withoutScripts.matchAll(/>([^<>]+)</g)].map((m) => m[1]);
  const attributes = [...withoutScripts.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return [...texts, ...attributes].map((text) => text.trim()).filter(Boolean);
}

test('le Studio parle de « scène », jamais de « preset » (sauf le paramètre d’URL ?preset=)', () => {
  const html = readFileSync(new URL('./studio.html', import.meta.url), 'utf8');
  const offenders = visibleTexts(html).filter((text) => /preset/i.test(text) && text !== '?preset=');
  expect(offenders).toEqual([]);
});

test('la règle voit bien le texte de la page (elle ne passe pas à vide)', () => {
  const html = readFileSync(new URL('./studio.html', import.meta.url), 'utf8');
  const texts = visibleTexts(html);
  expect(texts.length).toBeGreaterThan(100);
  expect(texts).toContain('Mes scènes');
  expect(visibleTexts('<p>Un preset</p><input aria-label="Nom du preset">').filter((t) => /preset/i.test(t))).toHaveLength(2);
});
