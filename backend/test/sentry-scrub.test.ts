import assert from 'node:assert/strict';
import test from 'node:test';

import { captureRequestException, initSentry, isSentryEnabled, scrubEvent } from '../core/sentry';
import type { ErrorEvent } from '@sentry/node';

test('AIN-P1-02 Sentry stays disabled and captureRequestException is a no-op without SENTRY_DSN', () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    assert.equal(initSentry(), false);
    assert.equal(isSentryEnabled(), false);
    // Must not throw when disabled.
    captureRequestException(new Error('boom'), { method: 'GET', headers: {}, url: '/x' } as any, 500);
  } finally {
    if (previous !== undefined) process.env.SENTRY_DSN = previous;
  }
});

test('AIN-P1-02 scrubEvent removes cookies, body, query, and sensitive headers', () => {
  const event = {
    request: {
      method: 'POST',
      url: 'https://aintel.inteligent.si/api/finance/pay',
      query_string: 'token=secret123',
      cookies: { session: 'abc' },
      data: { password: 'hunter2', iban: 'SI56...' },
      headers: {
        Authorization: 'Bearer tok',
        Cookie: 'session=abc',
        'X-Api-Key': 'k',
        'X-Web-Inquiry-Api-Key': 'k2',
        'Content-Type': 'application/json',
      },
    },
  } as unknown as ErrorEvent;

  const result = scrubEvent(event);
  assert.ok(result);
  const request = result!.request!;
  assert.equal(request.cookies, undefined);
  assert.equal(request.data, undefined);
  assert.equal(request.query_string, undefined);
  assert.equal(request.headers?.Authorization, undefined);
  assert.equal(request.headers?.Cookie, undefined);
  assert.equal(request.headers?.['X-Api-Key'], undefined);
  assert.equal(request.headers?.['X-Web-Inquiry-Api-Key'], undefined);
  // Non-sensitive headers and the method are preserved.
  assert.equal(request.headers?.['Content-Type'], 'application/json');
  assert.equal(request.method, 'POST');
});

test('AIN-P1-02 scrubEvent tolerates events without a request', () => {
  const event = { message: 'no request here' } as ErrorEvent;
  assert.doesNotThrow(() => scrubEvent(event));
  assert.equal(scrubEvent(event)?.message, 'no request here');
});
