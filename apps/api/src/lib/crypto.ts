import { hash, compare } from 'bcrypt-ts';
import { sign, verify } from 'hono/jwt';
import { AUTH_CONSTANTS } from '../config/constants';

/**
 * Hash a plain text password using bcrypt-ts (pure TypeScript / Web-compatible).
 * Salt rounds default to 10.
 */
export async function hashPassword(
  password: string,
  saltRounds: number = AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS
): Promise<string> {
  return hash(password, saltRounds);
}

/**
 * Verify a plain text password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  return compare(password, hashString);
}

/**
 * Generate a cryptographically secure, high-entropy random token hex string.
 * Uses the Web Crypto API (crypto.getRandomValues).
 */
export function generateSecureToken(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute the SHA-256 cryptographic digest of a token string.
 * Uses the native Web Crypto API (crypto.subtle.digest).
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign a JWT token using HMAC-SHA256 via Web Crypto API.
 */
export async function signAccessToken(
  payload: {
    sub: string;
    email: string;
    tenantId?: string;
    roles?: string[];
  },
  secret: string,
  expiresInSeconds: number = AUTH_CONSTANTS.ACCESS_TOKEN_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  return sign(tokenPayload, secret, 'HS256');
}

/**
 * Verify and decode an access token JWT.
 */
export async function verifyAccessToken(token: string, secret: string): Promise<any> {
  return verify(token, secret, 'HS256');
}

/**
 * Resolves the JWT secret according to strict environment requirements.
 * - In development (APP_ENV === 'development'), falls back to DEFAULT_DEV_JWT_SECRET if not provided.
 * - In staging, production, and all non-development environments, JWT_SECRET is strictly required.
 * - Fails closed without exposing secret values if missing.
 */
export function getJwtSecret(env?: { JWT_SECRET?: string; APP_ENV?: string }): string {
  const secret = env?.JWT_SECRET?.trim();
  if (secret && secret.length > 0) {
    return secret;
  }

  if (env?.APP_ENV === 'development') {
    return AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET;
  }

  throw {
    code: 'AUTH_CONFIG_ERROR',
    message: 'Authentication configuration error: JWT_SECRET is required in this environment.',
    status: 500,
  };
}
