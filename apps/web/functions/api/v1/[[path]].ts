/**
 * SR WORKSPACE — Staging Same-Origin API Proxy (Cloudflare Pages Function)
 *
 * Routes incoming browser requests to /api/v1/* on https://staging-workspace.srcodelab.space
 * directly to the upstream staging API Worker at https://sr-workspace-api-staging.srcodelabs.workers.dev.
 *
 * Security & Protocol Guarantees:
 * 1. Preserves browser Origin verbatim (never manufactures or alters Origin).
 * 2. Preserves multiple Set-Cookie response headers (sr_access and sr_refresh).
 * 3. Strips RFC hop-by-hop headers and sanitizes client-controlled forwarding headers.
 * 4. Enforces Cache-Control: no-store on all API responses.
 * 5. Fails closed with standard 502 Bad Gateway without leaking internal error traces.
 */

interface Env {
  API_UPSTREAM_URL?: string;
  STAGING_PROXY_SECRET?: string;
}

interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export type PagesFunction<
  Env = unknown,
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, Params, Data>) => Response | Promise<Response>;

const DEFAULT_UPSTREAM_URL = 'https://sr-workspace-api-staging.srcodelabs.workers.dev';

// Standard RFC 7230 / RFC 9110 hop-by-hop headers
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

// Headers that client must not spoof/smuggle to upstream
const CLIENT_FORWARDING_HEADERS = new Set([
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
]);

export const onRequest: PagesFunction<Env> = async (context) => {
  // Fail closed if STAGING_PROXY_SECRET is missing or empty
  if (!context.env?.STAGING_PROXY_SECRET) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PROXY_MISCONFIGURED',
          message: 'The staging API proxy secret is misconfigured.',
        },
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  const upstreamBase = context.env?.API_UPSTREAM_URL || DEFAULT_UPSTREAM_URL;

  const incomingUrl = new URL(context.request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);

  // Build clean request headers for upstream
  const forwardHeaders = new Headers();

  for (const [key, value] of context.request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    // Strip hop-by-hop headers
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
    // Strip client-controlled forwarding headers
    if (CLIENT_FORWARDING_HEADERS.has(lowerKey)) continue;

    forwardHeaders.set(key, value);
  }

  // Ensure upstream Host header matches the destination worker host
  forwardHeaders.set('host', upstreamUrl.host);

  // Set trusted forwarding headers from the actual incoming Cloudflare request
  forwardHeaders.set('x-forwarded-host', incomingUrl.host);
  forwardHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  // Unconditionally overwrite any client-supplied x-staging-proxy-secret with configured secret
  forwardHeaders.set('x-staging-proxy-secret', context.env.STAGING_PROXY_SECRET);

  // Prepare body for state-mutating methods
  const hasBody = !['GET', 'HEAD'].includes(context.request.method);
  const fetchOptions: RequestInit & { duplex?: 'half' } = {
    method: context.request.method,
    headers: forwardHeaders,
    body: hasBody ? context.request.body : undefined,
    redirect: 'manual',
  };

  if (hasBody) {
    fetchOptions.duplex = 'half';
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), fetchOptions);
  } catch {
    // Fail closed safely without exposing upstream internal details
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'UPSTREAM_GATEWAY_ERROR',
          message: 'The upstream API service is temporarily unavailable.',
        },
      }),
      {
        status: 502,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // Prepare response headers
  const responseHeaders = new Headers();

  for (const [key, value] of upstreamResponse.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
    if (lowerKey === 'set-cookie') continue;
    if (lowerKey === 'x-staging-proxy-secret') continue;
    responseHeaders.set(key, value);
  }

  // Preserve all Set-Cookie response headers (e.g. sr_access and sr_refresh)
  if (typeof (upstreamResponse.headers as any).getSetCookie === 'function') {
    const cookies = (upstreamResponse.headers as any).getSetCookie();
    for (const cookie of cookies) {
      responseHeaders.append('set-cookie', cookie);
    }
  } else {
    const rawSetCookie = upstreamResponse.headers.get('set-cookie');
    if (rawSetCookie) {
      responseHeaders.set('set-cookie', rawSetCookie);
    }
  }

  // Guarantee that API responses are never cached by intermediate CDN or browser
  responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  responseHeaders.set('pragma', 'no-cache');
  responseHeaders.set('expires', '0');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
