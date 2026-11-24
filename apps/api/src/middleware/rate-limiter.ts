import type { MiddlewareHandler } from 'hono';
import { apiError } from '../lib/response';
import type { HonoEnv } from '../types/context';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory isolate-local sliding window cache (L1 fast path)
const ipRateLimitStore = new Map<string, RateLimitRecord>();

export function clearRateLimitStore(): void {
  ipRateLimitStore.clear();
  d1TableInitialized = false;
}

let d1TableInitialized = false;

async function ensureD1RateLimitTable(db: any): Promise<void> {
  if (d1TableInitialized) return;
  try {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS _rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);'
    );
    d1TableInitialized = true;
  } catch {
    // If table already exists or D1 exec fails, gracefully proceed
  }
}

export function rateLimiter(options: {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
  enableDistributed?: boolean;
}): MiddlewareHandler<HonoEnv> {
  const windowMs = options.windowMs || 60 * 1000;
  const maxRequests = options.maxRequests || 60;
  const keyPrefix = options.keyPrefix || 'global';
  const enableDistributed = options.enableDistributed ?? true;

  return async (c, next) => {
    // In test environment, bypass only if explicitly requested via header
    if (c.env.APP_ENV === 'test' && c.req.header('x-skip-rate-limit') === 'true') {
      await next();
      return;
    }

    const clientIp =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      '127.0.0.1';

    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    // 1. Check in-memory L1 cache for immediate fast reject within the local isolate
    const localRecord = ipRateLimitStore.get(key);
    if (localRecord && now <= localRecord.resetAt && localRecord.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((localRecord.resetAt - now) / 1000);
      c.res.headers.set('Retry-After', `${retryAfterSeconds}`);
      return apiError(
        c,
        'RATE_LIMIT_EXCEEDED',
        `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
        429
      );
    }

    // 2. Distributed rate-limiting via Cloudflare D1 (Free tier, zero paid external services)
    if (enableDistributed && c.env.DB) {
      try {
        await ensureD1RateLimitTable(c.env.DB);
        const resetAt = now + windowMs;

        const row = await c.env.DB.prepare(
          `INSERT INTO _rate_limits (key, count, reset_at)
           VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET
             count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END,
             reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END
           RETURNING count, reset_at`
        )
          .bind(key, resetAt, now, now, resetAt)
          .first<{ count: number; reset_at: number }>();

        if (row) {
          // Sync L1 cache
          ipRateLimitStore.set(key, { count: row.count, resetAt: row.reset_at });

          if (row.count > maxRequests) {
            const retryAfterSeconds = Math.ceil((row.reset_at - now) / 1000);
            c.res.headers.set('Retry-After', `${retryAfterSeconds}`);
            return apiError(
              c,
              'RATE_LIMIT_EXCEEDED',
              `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
              429
            );
          }

          await next();
          return;
        }
      } catch {
        // Fallback to in-memory store if D1 query experiences transient issues
      }
    }

    // 3. Fallback in-memory counter update
    if (!localRecord || now > localRecord.resetAt) {
      ipRateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      await next();
      return;
    }

    localRecord.count += 1;
    await next();
  };
}

// Specialized strict limiter for login endpoint (5 attempts per minute)
export function loginRateLimiter() {
  return rateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'login',
    enableDistributed: true,
  });
}
