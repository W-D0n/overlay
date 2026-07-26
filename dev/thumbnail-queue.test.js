// @ts-check
import { expect, test } from 'bun:test';
import { createThumbnailQueue } from './thumbnail-queue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('1. les captures s’exécutent une par une, jamais en parallèle', async () => {
  const queue = createThumbnailQueue();
  const journal = [];
  let enCours = 0;

  const tache = (nom) => async () => {
    enCours += 1;
    journal.push(`${nom}:début`);
    expect(enCours).toBe(1);
    await tick();
    journal.push(`${nom}:fin`);
    enCours -= 1;
  };

  queue.push(tache('a'));
  queue.push(tache('b'));
  queue.push(tache('c'));
  while (!queue.idle()) await tick();

  expect(journal).toEqual(['a:début', 'a:fin', 'b:début', 'b:fin', 'c:début', 'c:fin']);
});

test('2. une capture qui échoue n’empêche pas les suivantes', async () => {
  const queue = createThumbnailQueue();
  const faites = [];
  queue.push(async () => { throw new Error('canvas indisponible'); });
  queue.push(async () => { faites.push('suivante'); });
  while (!queue.idle()) await tick();
  expect(faites).toEqual(['suivante']);
});

test('3. une file vide est au repos', () => {
  const queue = createThumbnailQueue();
  expect(queue.idle()).toBe(true);
  expect(queue.size()).toBe(0);
});

test('4. les tâches ajoutées pendant une exécution sont reprises', async () => {
  const queue = createThumbnailQueue();
  const faites = [];
  queue.push(async () => {
    faites.push('première');
    queue.push(async () => { faites.push('ajoutée en route'); });
  });
  while (!queue.idle()) await tick();
  expect(faites).toEqual(['première', 'ajoutée en route']);
});
