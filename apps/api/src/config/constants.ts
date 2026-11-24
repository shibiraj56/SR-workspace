export const AUTH_CONSTANTS = {
  ACCESS_COOKIE_NAME: 'sr_access',
  REFRESH_COOKIE_NAME: 'sr_refresh',
  CSRF_HEADER_NAME: 'x-csrf-token',
  
  // Default durations in seconds
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60, // 15 minutes
  REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60, // 7 days
  
  // Password hashing work factor (8 rounds yields ~35ms CPU time, safely within Cloudflare Workers 50ms CPU limit)
  BCRYPT_SALT_ROUNDS: 8,
  
  // Default JWT secret for local dev if not supplied in environment
  DEFAULT_DEV_JWT_SECRET: 'sr-workspace-dev-super-secret-jwt-key-minimum-32-chars-long!',
} as const;

export const APP_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_ORIGIN: 'https://workspace.srcodelab.space',
} as const;
