import type { D1Database } from '@cloudflare/workers-types';

export interface Bindings {
  DB: D1Database;
  APP_ENV?: string;
  APP_NAME?: string;
  API_PREFIX?: string;
  APP_ORIGIN?: string;
  JWT_SECRET?: string;
  JWT_ACCESS_EXPIRATION_SECONDS?: string;
  REFRESH_TOKEN_EXPIRATION_DAYS?: string;
}
