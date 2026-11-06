import { expect, test } from 'bun:test';
import { validateBackgroundEvent, VALID_EVENT_TYPES } from './background-event-format.js';

test('[validateBackgroundEvent] les 4 types valides sont acceptés', () => {
  for (const type of VALID_EVENT_TYPES) {
    expect(validateBackgroundEvent({ type })).toEqual({ ok: true, errors: [] });
  }
});

test('[validateBackgroundEvent] champs optionnels tolérés', () => {
  expect(validateBackgroundEvent({ type: 'sub', username: 'x', amount: 3, timestamp: 1 }).ok).toBe(true);
});

test('[validateBackgroundEvent] type inconnu rejeté', () => {
  const result = validateBackgroundEvent({ type: 'donation' });
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['type d’événement inconnu : donation']);
});

test('[validateBackgroundEvent] type manquant rejeté', () => {
  expect(validateBackgroundEvent({}).ok).toBe(false);
});

test('[validateBackgroundEvent] corps non-objet rejeté', () => {
  expect(validateBackgroundEvent(null).ok).toBe(false);
  expect(validateBackgroundEvent('sub').ok).toBe(false);
});
