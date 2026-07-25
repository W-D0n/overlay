// @ts-check
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { computeObsAuthResponse } from './obs-auth.js';

/** Référence indépendante (node:crypto) du même algorithme officiel OBS WS v5. */
function referenceAuthResponse(password, salt, challenge) {
  const base64Secret = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(base64Secret + challenge).digest('base64');
}

test('computeObsAuthResponse matches an independent SHA-256 reference implementation', async () => {
  const params = { password: 'supersecretpassword', salt: 'saltySalt==', challenge: 'chal1enge==' };
  const result = await computeObsAuthResponse(params);
  expect(result).toBe(referenceAuthResponse(params.password, params.salt, params.challenge));
});

test('computeObsAuthResponse is deterministic for identical inputs', async () => {
  const params = { password: 'pw', salt: 'sa', challenge: 'ch' };
  const [a, b] = await Promise.all([computeObsAuthResponse(params), computeObsAuthResponse(params)]);
  expect(a).toBe(b);
});

test('computeObsAuthResponse changes if the password changes', async () => {
  const base = { password: 'pw1', salt: 'sa', challenge: 'ch' };
  const other = { ...base, password: 'pw2' };
  const [a, b] = await Promise.all([computeObsAuthResponse(base), computeObsAuthResponse(other)]);
  expect(a).not.toBe(b);
});
