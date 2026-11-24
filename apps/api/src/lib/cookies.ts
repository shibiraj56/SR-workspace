import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { AUTH_CONSTANTS } from '../config/constants';
import type { HonoEnv } from '../types/context';

export function isSecureEnvironment(c: Context<HonoEnv>): boolean {
  const env = c.env.APP_ENV || 'development';
  if (env === 'production') return true;
  const proto = c.req.header('x-forwarded-proto') || '';
  const url = c.req.url;
  return proto === 'https' || url.startsWith('https:');
}

/**
 * Parse a raw Cookie header into a key-value record.
 */
export function parseCookieHeader(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx);
      const val = trimmed.substring(eqIdx + 1);
      cookies[key] = val;
    }
  }
  return cookies;
}

/**
 * Set the HttpOnly access token cookie.
 */
export function setAccessCookie(
  c: Context<HonoEnv>,
  token: string,
  maxAgeSeconds: number = AUTH_CONSTANTS.ACCESS_TOKEN_TTL_SECONDS
): void {
  const secure = isSecureEnvironment(c);
  setCookie(c, AUTH_CONSTANTS.ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Set the HttpOnly refresh token cookie, scoped to /api/v1/auth.
 */
export function setRefreshCookie(
  c: Context<HonoEnv>,
  token: string,
  maxAgeSeconds: number = AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS
): void {
  const secure = isSecureEnvironment(c);
  setCookie(c, AUTH_CONSTANTS.REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/api/v1/auth',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Retrieve the access token from either the HttpOnly cookie or the Authorization: Bearer header.
 */
export function getAccessToken(c: Context<HonoEnv>): string | undefined {
  const cookieHeader = c.req.header('cookie') || c.req.header('Cookie');
  const cookies = parseCookieHeader(cookieHeader);
  if (cookies[AUTH_CONSTANTS.ACCESS_COOKIE_NAME]) {
    return cookies[AUTH_CONSTANTS.ACCESS_COOKIE_NAME];
  }

  const cookieToken = getCookie(c, AUTH_CONSTANTS.ACCESS_COOKIE_NAME);
  if (cookieToken) return cookieToken;

  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return undefined;
}

/**
 * Retrieve the refresh token from the HttpOnly cookie.
 */
export function getRefreshToken(c: Context<HonoEnv>): string | undefined {
  const cookieHeader = c.req.header('cookie') || c.req.header('Cookie');
  const cookies = parseCookieHeader(cookieHeader);
  if (cookies[AUTH_CONSTANTS.REFRESH_COOKIE_NAME]) {
    return cookies[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];
  }

  return getCookie(c, AUTH_CONSTANTS.REFRESH_COOKIE_NAME);
}

/**
 * Clear both authentication cookies.
 */
export function clearAuthCookies(c: Context<HonoEnv>): void {
  const secure = isSecureEnvironment(c);
  deleteCookie(c, AUTH_CONSTANTS.ACCESS_COOKIE_NAME, { path: '/', secure });
  deleteCookie(c, AUTH_CONSTANTS.REFRESH_COOKIE_NAME, { path: '/api/v1/auth', secure });
}
