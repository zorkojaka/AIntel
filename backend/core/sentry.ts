import * as Sentry from '@sentry/node';
import type { ErrorEvent, EventHint } from '@sentry/node';
import type { Request } from 'express';

import { logger } from './logger';

let enabled = false;

// Header names that must never be forwarded to Sentry (auth, session, API keys).
const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-web-inquiry-api-key',
  'x-internal-api-key',
]);

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Initialise Sentry error tracking. No-op (returns false) when SENTRY_DSN is unset,
 * so the application runs normally without error tracking in dev/CI/local.
 *
 * EU data residency is carried by the DSN: create the Sentry project in the EU
 * region and its DSN ingests at `*.de.sentry.io`. We never hardcode the DSN — it is
 * supplied via the SENTRY_DSN environment variable.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info({ scope: 'sentry' }, 'SENTRY_DSN not set — error tracking disabled');
    return false;
  }

  const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE || undefined,
    // Never auto-attach IP address, cookies, headers, or request bodies.
    sendDefaultPii: false,
    // Errors only by default; enable performance traces explicitly if ever needed.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
  });

  enabled = true;
  logger.info({ scope: 'sentry', environment }, 'Sentry error tracking enabled');
  return true;
}

/**
 * Defence-in-depth scrubbing on top of sendDefaultPii:false. Strips cookies, request
 * body, sensitive headers, and query strings from every outgoing event so secrets and
 * personal data never leave the server.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data; // request body may carry passwords/PII
    delete request.query_string; // query may carry tokens/PII

    if (request.headers) {
      for (const key of Object.keys(request.headers)) {
        if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
          delete request.headers[key];
        }
      }
    }
  }
  return event;
}

/**
 * Capture a server error with minimal, safe request context. Identifies the user by
 * internal id + primary role only — no name, email, or other personal data.
 */
export function captureRequestException(err: unknown, req: Request, statusCode: number): void {
  if (!enabled) return;

  const context = (req as any).context ?? {};
  const roles: string[] = Array.isArray(context.roles) ? context.roles : [];
  const requestId = (req as any).id ?? req.headers['x-request-id'] ?? null;
  const route = (req as any).route?.path ?? (req as any).originalUrl ?? req.url ?? null;

  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setTag('http.method', req.method);
    scope.setTag('http.status_code', String(statusCode));
    if (requestId) scope.setTag('request_id', String(requestId));
    if (roles.length) scope.setTag('user.role', roles[0]);

    scope.setContext('request', {
      request_id: requestId,
      method: req.method,
      route,
      status_code: statusCode,
    });

    // Minimal identity only. sendDefaultPii:false keeps ip_address out.
    if (context.actorUserId) {
      scope.setUser({ id: String(context.actorUserId) });
    }

    Sentry.captureException(err);
  });
}
