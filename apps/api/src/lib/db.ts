import type { Context } from 'hono';
import { createDb, type AppDatabase } from '@sr-workspace/database';
import type { HonoEnv } from '../types/context';

export function getDb(c: Context<HonoEnv>): AppDatabase {
  const existing = c.get('db');
  if (existing) return existing;

  if (!c.env.DB) {
    throw new Error('D1 database binding "DB" is not available in environment.');
  }

  const db = createDb(c.env.DB);
  c.set('db', db);
  return db;
}
