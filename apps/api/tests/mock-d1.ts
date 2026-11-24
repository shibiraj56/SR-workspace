import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { D1Database, D1PreparedStatement, D1Response, D1ExecResult } from '@cloudflare/workers-types';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export function createTestD1Database(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Locate migrations directory across test execution directories
  const candidateDirs = [
    resolve(__dirname, '../../../packages/database/src/migrations'),
    resolve(process.cwd(), 'packages/database/src/migrations'),
    resolve(process.cwd(), '../../packages/database/src/migrations'),
  ];

  const migrationsDir = candidateDirs.find((d) => existsSync(d));
  if (!migrationsDir) {
    throw new Error(`Migrations directory not found. Checked: ${candidateDirs.join(', ')}`);
  }

  // Load and execute all .sql migration files in lexicographical order
  const { readdirSync } = require('node:fs');
  const sqlFiles = readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const fullPath = resolve(migrationsDir, file);
    const sql = readFileSync(fullPath, 'utf8');
    const statements = sql.split('--> statement-breakpoint');

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  }

  // Ensure distributed rate limit table exists in SQLite
  sqlite.exec('CREATE TABLE IF NOT EXISTS _rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);');

  const d1Mock = {
    prepare(query: string): D1PreparedStatement {
      let boundParams: any[] = [];
      const stmtObj = {
        bind(...params: any[]): D1PreparedStatement {
          // Normalize undefined/boolean params for SQLite
          boundParams = params.map((p) => {
            if (typeof p === 'boolean') return p ? 1 : 0;
            if (p instanceof Date) return p.getTime();
            if (p === undefined) return null;
            return p;
          });
          return stmtObj as unknown as D1PreparedStatement;
        },
        async all<T = unknown>(): Promise<any> {
          const stmt = sqlite.prepare(query);
          const rows = stmt.all(...boundParams) as T[];
          return {
            results: rows,
            success: true,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: rows.length,
              rows_written: 0,
              last_row_id: 0,
              changes: 0,
              served_by: 'mock-d1',
            },
          };
        },
        async run<T = unknown>(): Promise<any> {
          const stmt = sqlite.prepare(query);
          const info = stmt.run(...boundParams);
          return {
            success: true,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: 0,
              rows_written: info.changes,
              last_row_id: Number(info.lastInsertRowid),
              changes: info.changes,
              changed_db: true,
              served_by: 'mock-d1',
            },
          };
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const stmt = sqlite.prepare(query);
          const row = stmt.get(...boundParams) as any;
          if (!row) return null;
          return (colName ? row[colName] : row) as T;
        },
        async raw<T = unknown>(_options?: any): Promise<any[]> {
          const stmt = sqlite.prepare(query);
          const rows = stmt.all(...boundParams) as Record<string, any>[];
          // Cloudflare D1 raw() returns arrays of values, not objects
          return rows.map((r) => Object.values(r));
        },
      };
      return stmtObj as unknown as D1PreparedStatement;
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Response[]> {
      const results: D1Response[] = [];
      for (const statement of statements) {
        results.push(await statement.run<T>());
      }
      return results;
    },

    async exec(query: string): Promise<D1ExecResult> {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },

    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
  };

  return d1Mock as unknown as D1Database;
}
