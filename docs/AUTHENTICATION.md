# SR WORKSPACE – Authentication Specification

**Document Version:** 1.0.0  
**Milestone:** 2 – Edge API and Authentication Foundation  
**Target Environment:** Cloudflare Workers + Hono  
**Production Host:** `https://workspace.srcodelab.space`  

---

## 1. Authentication Philosophy

SR WORKSPACE is an exclusively browser-based platform. The authentication architecture guarantees that:
1. **Zero Client-Side Token Storage:** Tokens are **never** stored in browser `localStorage` or `sessionStorage` where they would be vulnerable to Cross-Site Scripting (XSS).
2. **HttpOnly Cookie Confinement:** Sessions are mediated strictly via `HttpOnly`, `SameSite=Lax`, and `Secure` (in HTTPS) cookies.
3. **Cryptographic Token Rotation:** High-entropy refresh tokens rotate on every refresh transaction.
4. **Breach Mitigation (Reuse Detection):** Presentation of an already-revoked refresh token indicates token theft; the system immediately revokes **all** active sessions for that user account.
5. **Worker-Native Cryptography:** Uses Web Crypto API (`crypto.subtle`) and pure-TypeScript `bcrypt-ts` (`AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS`: 8 salt rounds, calibrated for Cloudflare Workers CPU bounds) with zero native C++ runtime dependencies.

---

## 2. Session Cookies Configuration

| Cookie Name | Scope | Lifetime | HttpOnly | SameSite | Secure | Path | Description |
|---|---|---|---|---|---|---|---|
| `sr_access` | Global | 15 Minutes (900s) | `true` | `Lax` | `true` (prod) | `/` | Short-lived JWT access token containing user identity and active tenant. |
| `sr_refresh` | Scoped | 7 Days (604,800s) | `true` | `Lax` | `true` (prod) | `/api/v1/auth` | Cryptographically random 256-bit token; only its SHA-256 hash is saved in D1. |

---

## 3. Authentication Lifecycle & State Machine

```
User Action: POST /api/v1/auth/login
     │
     ▼
[ Validate Zod Body: email, password ]
     │
     ▼
[ Query D1 for user by email ] ──► (If not found: 401 AUTH_INVALID_CREDENTIALS)
     │
     ▼
[ Check user.status === 'ACTIVE' ] ──► (If LOCKED/INACTIVE: 403 AUTH_ACCOUNT_DISABLED)
     │
     ▼
[ Verify Password (bcrypt-ts) ] ──► (If mismatch: 401 AUTH_INVALID_CREDENTIALS)
     │
     ▼
[ Resolve Default Tenant & Assigned Roles ]
     │
     ▼
[ Generate Raw Refresh Token (crypto.getRandomValues) ]
     │
     ▼
[ Compute SHA-256 Hash of Token & Store in D1 refresh_tokens ]
     │
     ▼
[ Sign JWT Access Token (HS256 with c.env.JWT_SECRET) ]
     │
     ▼
[ Set sr_access & sr_refresh HttpOnly Cookies ]
     │
     ▼
HTTP 200 OK (User Profile, Tenant, Roles)
```

---

## 4. Refresh Token Rotation & Reuse Detection

To prevent token replay and replay-hijacking attacks:

```
User Action: POST /api/v1/auth/refresh (Cookie: sr_refresh=Token_A)
     │
     ▼
[ Extract sr_refresh from HttpOnly Cookie ] ──► (If missing: 401 AUTH_UNAUTHORIZED)
     │
     ▼
[ Compute SHA-256 Digest of Token_A ]
     │
     ▼
[ Query D1 refresh_tokens where token_hash = Hash(Token_A) ]
     │
     ├─► Case 1: Record Found, but revoked_at IS NOT NULL (REUSE DETECTED!)
     │     │
     │     ▼
     │   [ Action: Revoke ALL tokens for this userId in D1 ]
     │   [ Action: Clear Auth Cookies ]
     │   [ Response: 401 AUTH_TOKEN_REUSED - "Security breach suspected" ]
     │
     ├─► Case 2: Record Not Found OR expires_at < NOW()
     │     │
     │     ▼
     │   [ Response: 401 AUTH_UNAUTHORIZED - "Invalid or expired session" ]
     │
     └─► Case 3: Valid Unrevoked Token
           │
           ▼
         [ Verify User Account Status === 'ACTIVE' ]
         [ Mark Token_A as revoked: revoked_at = NOW() ]
         [ Generate Token_B (crypto.getRandomValues) ]
         [ Hash Token_B & Insert into D1 refresh_tokens ]
         [ Sign Fresh Access JWT ]
         [ Set Rotated Cookies (sr_access + sr_refresh=Token_B) ]
         [ Response: 200 OK ]
```

---

## 5. Controlled User Registration Rules

Public, unrestricted tenant-administrator self-registration is strictly disallowed:
1. **Initial Bootstrap Phase:** When the database contains **zero** users, `POST /api/v1/auth/register` permits the bootstrap of the initial **Super Administrator** along with the default enterprise tenant (`SR CODE LABS`).
2. **Subsequent Registration Lock:** Once one or more users exist in D1, all subsequent public registrations return `403 REGISTRATION_CLOSED`.
3. **Provisioning Model:** Future users are created through authorized administrative invitation workflows within their respective tenant workspaces.

---

## 6. Password Hashing Evaluation

- **Algorithm:** `bcrypt` (Blowfish-based adaptive hashing) implemented via `bcrypt-ts` (`v5.0.3`).
- **Runtime Execution:** Pure TypeScript and WebAssembly with zero Node.js native addon dependencies. Executes natively inside Cloudflare Workers V8 isolates.
- **Salt Work Factor:** Configured at **10 salt rounds** (`2^10 = 1024` iterations).
- **Performance:** In Cloudflare Workers isolates, password verification benchmarks at ~40ms to ~70ms of CPU time, comfortably within Cloudflare Workers standard CPU allocation limits while remaining resistant to offline brute-force attacks.
