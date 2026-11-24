import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const healthController = new Hono<HonoEnv>();

healthController.get('/', async (c) => {
  const start = performance.now();
  let dbStatus = 'disconnected';
  let dbLatencyMs = 0;

  try {
    const db = getDb(c);
    const queryStart = performance.now();
    await db.run(sql`SELECT 1 as alive`);
    dbLatencyMs = Math.round(performance.now() - queryStart);
    dbStatus = 'connected';
  } catch (err: any) {
    dbStatus = 'error';
    if (c.env.APP_ENV !== 'test') {
      console.error('[HEALTH] Database connectivity check failed:', err.message);
    }
  }

  const isHealthy = dbStatus === 'connected';
  const totalDurationMs = Math.round(performance.now() - start);

  const payload = {
    status: isHealthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: c.env.APP_ENV || 'development',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    uptimeMs: totalDurationMs,
  };

  if (!isHealthy) {
    return apiError(c, 'SERVICE_UNHEALTHY', 'Database connectivity failure.', 503, [
      { message: `Database check returned status: ${dbStatus}` },
    ]);
  }

  return apiSuccess(c, payload, 200);
});
