# SR WORKSPACE – API Architecture Specification

**Document Version:** 1.0.0  
**Milestone:** 2 – Edge API and Authentication Foundation  
**Target Environment:** Cloudflare Workers (V8 Isolate Edge Runtime)  
**Production Host:** `https://workspace.srcodelab.space`  
**API Prefix:** `/api/v1`  
**Framework:** Hono (`^4.6.0`) with TypeScript  
**Database Binding:** Cloudflare D1 (`DB`) via Drizzle ORM  

---

## 1. Executive Summary & Design Principles

SR WORKSPACE is an exclusively browser-based enterprise collaboration platform. The backend API is designed from first principles for serverless edge execution on Cloudflare Workers, eliminating traditional container and VM overhead while guaranteeing sub-5ms cold starts globally.

### Architectural Principles
1. **Web Standards First:** Built exclusively on web standard APIs (`Request`, `Response`, `Headers`, `crypto.subtle`, `URL`). Zero reliance on Node.js native bindings or legacy Express abstractions.
2. **Strict Multi-Tenant Isolation:** Multi-tenancy is enforced not merely by convention or token extraction, but by deterministic tenant-membership database validation and automated query-level discriminator scoping (`tenantId`).
3. **Defense-in-Depth Authentication:** Browser security is anchored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies with cryptographically rotating refresh tokens, SHA-256 token hashing at rest in D1, and anti-CSRF protections for state-changing requests. Never store tokens in `localStorage` or `sessionStorage`.
4. **Predictable API Contracts:** All endpoints adhere to a standardized JSON response envelope, explicit Zod validation schemas, and well-typed error taxonomies.
5. **Zero Paid API Dependencies:** The entire edge backend runs within standard Cloudflare and open-source tooling, incurring zero external paid API or service costs.

---

## 2. Framework & Runtime Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│               Client Browser (workspace.srcodelab.space)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Cookie-Auth + JSON Payload)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Edge / Anycast Network                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Cloudflare Workers Runtime (V8 Isolate)                          │  │
│  │ Entrypoint: apps/api/src/index.ts                                │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Hono Application Pipeline (apps/api/src/app.ts)                  │  │
│  │  1. Request ID & Execution Timing                                │  │
│  │  2. Security Headers & CORS (Strict Origin Validation)          │  │
│  │  3. Sliding-Window Login Rate Limiter                            │  │
│  │  4. Centralized Error Boundary Handler                           │  │
│  │  5. JWT Auth Guard & Session Validator (Cookie Parser)           │  │
│  │  6. Tenant Membership Validator & Scoping Middleware             │  │
│  │  7. Zod Route Validator (@hono/zod-validator)                    │  │
│  │  8. Module Route Handlers (/health, /auth, /users)               │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Data Access Layer: @sr-workspace/database (Drizzle ORM)          │  │
│  └────────────────────────────────┬─────────────────────────────────┘  │
│                                   │ D1 Binding: c.env.DB               │
│                                   ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Cloudflare D1 Database (SQLite at the Edge)                      │  │
│  │  - Tenants, Users, RefreshTokens, Roles, Permissions, Audit      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory & Module Structure

The backend application in `apps/api` is organized around domain modules with shared cross-cutting concerns:

```
apps/api/
├── src/
│   ├── index.ts                 # Worker fetch handler and export
│   ├── app.ts                   # Hono app instantiation & middleware wiring
│   ├── config/
│   │   ├── env.ts               # Cloudflare environment bindings & Zod validation
│   │   └── constants.ts         # Cookie names, token lifespans, security constants
│   ├── middleware/
│   │   ├── auth.ts              # Session verification & JWT decoding
│   │   ├── tenant.ts            # Tenant membership validation & context injection
│   │   ├── error-handler.ts     # Global exception filter & safe error responses
│   │   ├── request-logger.ts    # Sanitized request logging (no credentials)
│   │   ├── rate-limiter.ts      # Brute-force & endpoint protection
│   │   └── csrf.ts              # CSRF validation for state-changing requests
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts # Route declarations & handlers
│   │   │   ├── auth.service.ts    # Credentials, sessions, token rotation
│   │   │   └── auth.schemas.ts    # Zod request/response validation schemas
│   │   ├── health/
│   │   │   └── health.controller.ts # Health check & D1 connectivity probe
│   │   └── users/
│   │       └── users.controller.ts  # Authenticated user profiles & tenant memberships
│   ├── lib/
│   │   ├── crypto.ts            # Web Crypto API utilities (SHA-256, tokens, passwords)
│   │   ├── cookies.ts           # Secure cookie getter/setter abstractions
│   │   └── response.ts          # Standardized JSON response formatting
│   └── types/
│       ├── context.ts           # Extended Hono context variables (user, tenant)
│       └── env.ts               # Env interface matching wrangler.jsonc bindings
├── tests/                       # Automated test suites
├── wrangler.jsonc               # Cloudflare Worker configuration & D1 binding
├── package.json
└── tsconfig.json
```

---

## 4. Request Lifecycle & Middleware Pipeline

Every HTTP transaction passes through ordered middleware layers:

```
Incoming Request
      │
      ▼
1. [ Request ID Middleware ] ──► Injects unique `X-Request-Id` (UUID) into context & response header
      │
      ▼
2. [ Request Logger ] ──────────► Records method, path, and sanitized client IP (omits body/headers)
      │
      ▼
3. [ Security Headers & CORS ] ─► Enforces Strict-Transport-Security, X-Frame-Options: DENY,
      │                          X-Content-Type-Options: nosniff, Origin whitelist
      ▼
4. [ Error Handler ] ───────────► Wraps downstream handlers; captures unhandled exceptions
      │
      ▼
5. [ Rate Limiter ] ────────────► Checks IP/endpoint sliding window threshold (e.g. 5 fails/min)
      │
      ▼
6. [ Authentication Guard ] ────► Extracts access token from cookie/header; verifies JWT via Web Crypto;
      │                          Attaches `c.set('user', userPayload)`
      ▼
7. [ Tenant Scoping Guard ] ────► Verifies active tenant membership in D1; checks user/tenant status;
      │                          Attaches `c.set('tenantId', tenantId)`
      ▼
8. [ Zod Request Validator ] ───► Validates JSON body / query params against module schemas
      │
      ▼
9. [ Controller Handler ] ──────► Invokes domain service; executes scoped D1 Drizzle query
      │
      ▼
Standard JSON Envelope Response
```

---

## 5. Cloudflare D1 Integration Architecture

### 5.1 Binding & Client Instantiation
The API accesses Cloudflare D1 through the bound environment variable `c.env.DB`.
Instead of creating duplicate schema definitions or secondary database drivers, `apps/api` directly imports the existing database layer:

```typescript
import { createDb } from '@sr-workspace/database';

export function getDb(c: Context) {
  return createDb(c.env.DB);
}
```

### 5.2 Scoped Query Pattern
To eliminate tenant data leaks, domain repositories apply the verified tenant scope to all operations:

```typescript
// Safe scoped query pattern:
const userInTenant = await db.query.userTenants.findFirst({
  where: and(
    eq(userTenants.userId, currentUserId),
    eq(userTenants.tenantId, currentTenantId),
    eq(userTenants.status, 'ACTIVE')
  ),
});
```

---

## 6. Authentication & Session Strategy

### 6.1 Cookie-First Architecture
Because SR WORKSPACE is exclusively a web browser application, tokens are **never returned to client JavaScript to store in localStorage or sessionStorage**.

| Cookie Name | Purpose | Lifespan | HttpOnly | Secure | SameSite | Path |
|---|---|---|---|---|---|---|
| `sr_access` | Short-lived JWT access token | 15 minutes | `true` | `true` (prod) | `Lax` | `/` |
| `sr_refresh` | High-entropy random refresh token | 7 days | `true` | `true` (prod) | `Lax` | `/api/v1/auth` |

### 6.2 Refresh Token Rotation & Hash Storage
1. **Generation:** When a user logs in, a cryptographically secure 256-bit random string is generated via `crypto.getRandomValues`.
2. **Hash at Rest:** The raw token is hashed using SHA-256 (`crypto.subtle.digest`). Only the resulting hex string is stored in the `refresh_tokens` table in D1. The raw string is sent exclusively in the `sr_refresh` cookie.
3. **Rotation:** On every call to `POST /api/v1/auth/refresh`:
   - The token hash is looked up in D1.
   - If found and `revoked_at` is `null` and `expires_at > NOW()`, a new refresh token is issued.
   - The old token's `revoked_at` timestamp is immediately updated.
4. **Reuse Detection (Breach Protection):** If an incoming refresh token hash matches a record that has **already been revoked**, it indicates potential token theft. The system immediately revokes **all** refresh tokens for that user and denies the request.

---

## 7. Standardized API Envelopes & Error Taxonomy

### 7.1 Success Response Envelope
All successful responses return HTTP 200/201 with the standard structure:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "email": "user@srcodelab.space",
      "firstName": "John",
      "lastName": "Doe"
    }
  },
  "meta": {
    "requestId": "req-uuid-v4",
    "timestamp": 1732356000000
  }
}
```

### 7.2 Error Response Envelope
All error responses return standard HTTP 4xx/5xx status codes with safe, actionable error details:
```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password.",
    "details": null
  },
  "meta": {
    "requestId": "req-uuid-v4",
    "timestamp": 1732356000000
  }
}
```

### 7.3 Standard Error Codes
- `VALIDATION_ERROR` (400): Schema validation failure.
- `AUTH_UNAUTHORIZED` (401): Missing, invalid, or expired session.
- `AUTH_FORBIDDEN` (403): Account locked, inactive, or lacking permission.
- `AUTH_TOKEN_REUSED` (401): Revoked refresh token reuse detected.
- `TENANT_ACCESS_DENIED` (403): User not a member of specified tenant.
- `RATE_LIMIT_EXCEEDED` (429): Brute-force threshold exceeded.
- `RESOURCE_NOT_FOUND` (404): Requested entity does not exist.
- `INTERNAL_SERVER_ERROR` (500): Unexpected failure; error details masked.

---

## 8. Summary of Milestone 2 Endpoints

| Method | Path | Auth Required | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | No | API readiness & Cloudflare D1 database probe |
| `POST` | `/api/v1/auth/register` | Controlled | Initial system administrator or invite setup |
| `POST` | `/api/v1/auth/login` | No | Authenticate credentials; issue session cookies |
| `POST` | `/api/v1/auth/refresh` | Cookie | Rotate refresh token; issue fresh access cookie |
| `POST` | `/api/v1/auth/logout` | Yes | Revoke active refresh token; clear cookies |
| `GET` | `/api/v1/auth/me` | Yes | Return authenticated user, active tenant & roles |
