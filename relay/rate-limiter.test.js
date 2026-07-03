// @ts-check
import { test, expect } from 'bun:test';
import { createRateLimiter } from './rate-limiter.js';

test('allows requests under the limit within the window', () => {
  const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 3 });
  expect(limiter.allow('ip1', 0)).toBe(true);
  expect(limiter.allow('ip1', 100)).toBe(true);
  expect(limiter.allow('ip1', 200)).toBe(true);
});

test('rejects requests beyond the limit within the same window', () => {
  const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 2 });
  expect(limiter.allow('ip1', 0)).toBe(true);
  expect(limiter.allow('ip1', 100)).toBe(true);
  expect(limiter.allow('ip1', 200)).toBe(false);
});

test('resets once old hits fall outside the sliding window', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
  expect(limiter.allow('ip1', 0)).toBe(true);
  expect(limiter.allow('ip1', 500)).toBe(false);
  expect(limiter.allow('ip1', 1001)).toBe(true);
});

test('tracks separate keys independently', () => {
  const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 1 });
  expect(limiter.allow('ip1', 0)).toBe(true);
  expect(limiter.allow('ip2', 0)).toBe(true);
  expect(limiter.allow('ip1', 10)).toBe(false);
  expect(limiter.allow('ip2', 10)).toBe(false);
});

test('boundary: exactly maxRequests are allowed, the next one is not', () => {
  const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 5 });
  for (let i = 0; i < 5; i++) {
    expect(limiter.allow('ip1', i)).toBe(true);
  }
  expect(limiter.allow('ip1', 5)).toBe(false);
});
