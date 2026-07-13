import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLoginRateLimitKey,
  FixedWindowRateLimiter,
  getLoginRateLimitConfig,
} from '../modules/auth/services/login-rate-limit.service';

test('AIN-P3-01 login rate limiter blocks attempts after configured threshold', () => {
  const limiter = new FixedWindowRateLimiter();
  const key = buildLoginRateLimitKey({
    tenantId: 'inteligent',
    email: 'USER@Example.test',
    ip: '127.0.0.1',
  });
  const sameNormalizedKey = buildLoginRateLimitKey({
    tenantId: 'INTELIGENT',
    email: 'user@example.test',
    ip: '127.0.0.1',
  });

  assert.equal(key, sameNormalizedKey);
  assert.equal(limiter.consume(key, { maxAttempts: 2, windowMs: 60_000 }, 1_000).allowed, true);
  assert.equal(limiter.consume(key, { maxAttempts: 2, windowMs: 60_000 }, 2_000).allowed, true);

  const blocked = limiter.consume(key, { maxAttempts: 2, windowMs: 60_000 }, 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 58);
});

test('AIN-P3-01 login rate limiter resets after success and expires by window', () => {
  const limiter = new FixedWindowRateLimiter();
  const key = buildLoginRateLimitKey({ tenantId: 'inteligent', email: 'user@example.test', ip: '127.0.0.1' });

  limiter.consume(key, { maxAttempts: 1, windowMs: 60_000 }, 1_000);
  assert.equal(limiter.consume(key, { maxAttempts: 1, windowMs: 60_000 }, 2_000).allowed, false);

  limiter.reset(key);
  assert.equal(limiter.consume(key, { maxAttempts: 1, windowMs: 60_000 }, 3_000).allowed, true);

  assert.equal(limiter.consume(key, { maxAttempts: 1, windowMs: 60_000 }, 4_000).allowed, false);
  assert.equal(limiter.consume(key, { maxAttempts: 1, windowMs: 60_000 }, 70_000).allowed, true);
});

test('AIN-P3-01 login rate limit config can be tuned by env', () => {
  const previousMax = process.env.AINTEL_LOGIN_RATE_LIMIT_MAX;
  const previousWindow = process.env.AINTEL_LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  process.env.AINTEL_LOGIN_RATE_LIMIT_MAX = '7';
  process.env.AINTEL_LOGIN_RATE_LIMIT_WINDOW_SECONDS = '120';

  try {
    assert.deepEqual(getLoginRateLimitConfig(), { maxAttempts: 7, windowMs: 120_000 });
  } finally {
    if (previousMax === undefined) {
      delete process.env.AINTEL_LOGIN_RATE_LIMIT_MAX;
    } else {
      process.env.AINTEL_LOGIN_RATE_LIMIT_MAX = previousMax;
    }
    if (previousWindow === undefined) {
      delete process.env.AINTEL_LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.AINTEL_LOGIN_RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});
