# SR WORKSPACE – Security & Tenant Isolation Specification

**Document Version:** 1.0.0  
**Milestone:** 2 – Edge API and Authentication Foundation  
**Target Environment:** Cloudflare Workers + Cloudflare D1  
**Production Host:** `https://workspace.srcodelab.space`  

---

## 1. Threat Model & Security Architecture

SR WORKSPACE is designed with defense-in-depth security principles tailored to multi-tenant, browser-based edge deployments:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Threat Vectors & Mitigations                    │
├──────────────────────────────┬─────────────────────────────────────────┤
│ Threat Vector                │ Architectural Mitigation                │
├──────────────────────────────┼─────────────────────────────────────────┤
│ Cross-Tenant Data Leakage    │ Deterministic D1 membership checks +    │
│                              │ explicit query-level tenant scoping     │
├──────────────────────────────┼─────────────────────────────────────────┤
│ XSS Credential Theft         │ HttpOnly cookies (inaccessible to JS)   │
├──────────────────────────────┼─────────────────────────────────────────┤
│ CSRF on State-Changing API   │ SameSite=Lax + Origin/Referer guard     │
├──────────────────────────────┼─────────────────────────────────────────┤
│ Brute-Force Login Attacks    │ Sliding-window rate limiting on /login  │
├──────────────────────────────┼─────────────────────────────────────────┤
│ Refresh Token Replay / Theft │ Cryptographic rotation + reuse breaker  │
├──────────────────────────────┼─────────────────────────────────────────┤
│ Credential Exposure in Logs  │ Strict logging sanitization             │
├──────────────────────────────┼─────────────────────────────────────────┤
│ Clickjacking / MIME sniffing │ Security response headers               │
└──────────────────────────────┴─────────────────────────────────────────┘
```

---

## 2. Multi-Tenant Security & Isolation Model

### 2.1 The Anti-Pattern: Blind Token Scoping
Many SaaS backends merely decode a `tenantId` claim from a JWT and assume the user is authorized. If a user’s permissions are revoked or if they attempt to pass a forged `X-Tenant-Id` header, blind scoping fails.

### 2.2 SR WORKSPACE Tenant Isolation Pipeline
In `apps/api/src/middleware/tenant.ts`:

1. **Identity Verification:** The user's active session is cryptographically validated via `authMiddleware()`.
2. **Context Resolution:** The requested tenant ID is extracted from the `X-Tenant-Id` header, query parameter, or user default.
3. **Tenant Status Verification:** D1 is queried to ensure the tenant exists and is in `ACTIVE` status.
4. **Active Membership Verification:** D1 is queried on the `user_tenants` table to confirm that:
   - `user_tenants.userId === authenticatedUser.id`
   - `user_tenants.tenantId === requestedTenantId`
   - `user_tenants.status === 'ACTIVE'`
5. **Cross-Tenant Access Rejection:** If no active membership exists (and the user is not a system `SUPER_ADMIN`), the request is aborted with `403 TENANT_ACCESS_DENIED`.
6. **Query-Level Scoping:** Controllers invoke `getTenantScope(c)`, enforcing that all downstream queries explicitly filter on `tenantId`.

---

## 3. Cross-Site Request Forgery (CSRF) Protection

For browser clients using HttpOnly cookies:
- **SameSite Protection:** All authentication cookies specify `SameSite: 'Lax'`, blocking cross-site embedding and standard third-party request submission.
- **Origin & Referer Validation:** State-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) pass through `csrfProtection()` middleware which verifies that incoming `Origin` or `Referer` headers match the approved application domain:
  - Allowed in Production: `https://workspace.srcodelab.space`
  - Allowed in Local Development: `http://localhost:*`, `http://127.0.0.1:*`

---

## 4. Rate Limiting & Brute-Force Protection

- **Endpoint Rate Limiter:** Built into `apps/api/src/middleware/rate-limiter.ts`.
- **Login Strict Policy:**
  - Maximum **5 failed login attempts per minute** per client IP.
  - Exceeding the threshold returns `429 RATE_LIMIT_EXCEEDED` with a `Retry-After: <seconds>` header.
- **Production Edge Rate Limiting:** In production Cloudflare Workers deployments, Cloudflare Edge WAF Rate Limiting rules backstop the application-level sliding window limiter.

---

## 5. Security Headers Matrix

All responses dispatched by the Hono API include hardened HTTP security headers:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## 6. Logging & Telemetry Hygiene

The `requestLogger` middleware enforces strict hygiene:
- Only HTTP method, sanitized path, HTTP status code, request duration, and masked client IP are logged.
- Request and response bodies, Authorization headers, Cookie headers, and credentials are **never printed to logs**.
- Unique `X-Request-Id` UUIDs correlate client issues without exposing sensitive data.
