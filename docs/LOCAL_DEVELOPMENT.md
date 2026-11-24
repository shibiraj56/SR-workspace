# SR WORKSPACE – Local Development Guide

**Document Version:** 1.0.0  
**Milestone:** 2 – Edge API and Authentication Foundation  
**Target Environment:** Cloudflare Workers (Wrangler) + Cloudflare D1  
**Production URL:** `https://workspace.srcodelab.space`  

---

## 1. Prerequisites

Ensure your development workstation meets the minimum environment requirements:
- **Node.js:** `>=22.0.0` (Verified on Node `v24.22.0`).
- **pnpm:** `>=10.0.0` (Monorepo configured with `pnpm@12.16.1`).
- **Cloudflare Wrangler:** Installed as a workspace dependency (`wrangler@^3.99.0`).

---

## 2. Monorepo Structure

```
SR WORKSPACE/
├── apps/
│   └── api/                # Cloudflare Workers + Hono API Gateway
├── packages/
│   └── database/           # Drizzle ORM + Cloudflare D1 schemas & migrations
├── docs/                   # Architectural & technical specifications
├── package.json            # Monorepo scripts
└── pnpm-workspace.yaml     # Workspace configuration
```

---

## 3. Installation & Dependency Setup

```bash
# Clone or navigate to the project directory
cd "D:\SR WORKSPACE"

# Install all workspace dependencies
pnpm install

# Approve build scripts for native and edge dependencies
pnpm approve-builds --all
```

---

## 4. Database Setup & Migrations (Cloudflare D1)

The database schema is managed via Drizzle ORM in `packages/database`.

```bash
# 1. Build the database package
pnpm --filter @sr-workspace/database build

# 2. Generate new D1 SQLite migration files from schema definitions
pnpm --filter @sr-workspace/database db:generate
```

Migration files are output to `packages/database/src/migrations/`.

---

## 5. Running the API Locally (Wrangler)

To start the Cloudflare Workers API locally with in-memory D1 simulation:

```bash
# Navigate to the API application
cd "D:\SR WORKSPACE\apps\api"

# Start local Wrangler development server
pnpm dev
```

By default, the API will be available at:
`http://localhost:8787`

### Available Endpoints for Local Verification
- **Health Check:** `GET http://localhost:8787/api/v1/health`
- **Initial Registration:** `POST http://localhost:8787/api/v1/auth/register`
- **Login:** `POST http://localhost:8787/api/v1/auth/login`
- **Current User Profile:** `GET http://localhost:8787/api/v1/auth/me`

---

## 6. Super Administrator Bootstrap (`create-admin`)

To initialize a Super Administrator account in the local Cloudflare D1 database:

```bash
# Interactive mode (prompts for email, password, and tenant):
pnpm create-admin

# Or non-interactive CLI arguments:
pnpm create-admin admin@srcodelab.space YourSecurePassword123! "SR CODE LABS"
```

The bootstrap CLI:
- Connects directly to the local Cloudflare D1 database (`--local`).
- Resolves `bcrypt-ts` via the existing `@sr-workspace/api` workspace package without duplicate dependencies.
- Uses pure TypeScript `bcrypt-ts` hashing matching `AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS` (work factor 8) from the backend API.
- Generates and assigns the system `SUPER_ADMIN` role and maps the user to the default tenant.
- Never prints or exposes raw passwords or password hashes.

### Logging In Locally

1. Start the API and Web development servers:
   ```bash
   pnpm dev:api   # Cloudflare Workers API on http://localhost:8787
   pnpm dev:web   # Vite React frontend on http://localhost:5173
   ```
2. Navigate to `http://localhost:5173/login` in your browser.
3. Enter your administrator email and password.
4. Upon authentication, secure `HttpOnly` session cookies (`sr_access`, `sr_refresh`) are set and you will be redirected to the dashboard.

---

## 7. Running Automated Tests

The backend test suite runs with Vitest, using an in-memory SQLite D1 simulation harness (`apps/api/tests/mock-d1.ts`) executing actual D1 migration files:

```bash
# Run all automated tests in apps/api
pnpm --filter @sr-workspace/api test

# Run tests across the entire monorepo
pnpm test
```

All 17 test cases test live scenarios:
- Health probe & D1 connectivity.
- Admin bootstrap & registration lockout.
- Password hashing & verification.
- HttpOnly cookie issuance (`sr_access`, `sr_refresh`).
- Token rotation & reuse detection (breach mitigation).
- Multi-tenant boundary validation and cross-tenant rejection.

---

## 7. Static Analysis & Type Checking

```bash
# Run TypeScript compilation check across all packages
pnpm run typecheck

# Build all packages and applications
pnpm run build
```

---

## 8. Environment Variables & Cloudflare Bindings

Configured in `apps/api/wrangler.jsonc`:

| Variable / Binding | Type | Purpose | Default / Example |
|---|---|---|---|
| `DB` | D1 Database | Cloudflare D1 edge database binding | Bound in `wrangler.jsonc` |
| `APP_ENV` | Variable | Runtime environment identifier | `development` / `production` |
| `APP_NAME` | Variable | Application title | `SR WORKSPACE API` |
| `API_PREFIX` | Variable | Base API path prefix | `/api/v1` |
| `APP_ORIGIN` | Variable | Primary web browser domain | `https://workspace.srcodelab.space` |
| `JWT_SECRET` | Secret | Key for HMAC-SHA256 JWT signing | Managed via `wrangler secret put` |
| `JWT_ACCESS_EXPIRATION_SECONDS` | Variable | Access token lifespan | `900` (15 minutes) |
| `REFRESH_TOKEN_EXPIRATION_DAYS` | Variable | Refresh token lifespan | `7` (7 days) |
