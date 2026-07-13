import crypto from 'node:crypto';

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

function parsePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLoginRateLimitConfig(): RateLimitConfig {
  const maxAttempts = parsePositiveInteger(process.env.AINTEL_LOGIN_RATE_LIMIT_MAX, 5);
  const windowSeconds = parsePositiveInteger(process.env.AINTEL_LOGIN_RATE_LIMIT_WINDOW_SECONDS, 15 * 60);
  return {
    maxAttempts,
    windowMs: windowSeconds * 1000,
  };
}

export function buildLoginRateLimitKey(input: { tenantId: string; email: string; ip?: string | null }) {
  const rawKey = [
    input.tenantId.trim().toLowerCase(),
    input.email.trim().toLowerCase(),
    (input.ip || 'unknown').trim(),
  ].join(':');
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  consume(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
    const existing = this.entries.get(key);
    const entry =
      existing && existing.expiresAt > now
        ? existing
        : {
            count: 0,
            expiresAt: now + config.windowMs,
          };

    if (entry.count >= config.maxAttempts) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
        remaining: 0,
      };
    }

    entry.count += 1;
    this.entries.set(key, entry);
    return {
      allowed: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
      remaining: Math.max(0, config.maxAttempts - entry.count),
    };
  }

  reset(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

export const loginRateLimiter = new FixedWindowRateLimiter();
