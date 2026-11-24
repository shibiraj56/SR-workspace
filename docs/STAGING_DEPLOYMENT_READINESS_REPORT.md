# SR WORKSPACE – Staging Deployment Readiness Report

**Company:** SR CODE LABS
**Product:** SR WORKSPACE
**Workspace:** `D:\SR WORKSPACE`
**Branch:** `staging`
**Report Date:** 2026-11-24
**Status:** Staging Readiness Implementation Complete – Awaiting Operator Resource Provisioning & Deployment

---

## 1. Executive Summary

This report documents the implementation and verification of the Cloudflare Staging Deployment Readiness initiative for **SR WORKSPACE**. All development and security hardening have been executed strictly on the `staging` branch without altering production configurations, touching remote Cloudflare resources, or running remote D1 migrations.

The application architecture—built on **Cloudflare Workers (Hono)**, **Cloudflare D1 (SQLite + Drizzle ORM)**, and **React (Vite + Tailwind CSS)**—has been enhanced to support complete environment isolation between production (`workspace.srcodelab.space`) and staging (`staging-workspace.srcodelab.space`).

All six security observations (OBS-1 through OBS-6) identified in the Milestone 7 Phase D Security Audit have been remediated and rigorously verified. The entire automated test suite (16 test files, 121 tests) passes with 100% success, typechecking reports zero errors across all workspaces, and frontend staging/production builds compile cleanly.

---

## 2. Target Environment Topology

| Parameter | Production Environment | Isolated Staging Environment |
| :--- | :--- | :--- |
| **Branch** | `main` | `staging` |
| **Worker / API Service** | `sr-workspace-api` | `sr-workspace-api-staging` |
| **API Domain** | `https://api.workspace.srcodelab.space` | `https://api-staging-workspace.srcodelab.space` |
| **Frontend / Pages Host** | `sr-workspace-web` | `sr-workspace-web-staging` |
| **Web Origin** | `https://workspace.srcodelab.space` | `https://staging-workspace.srcodelab.space` |
| **Cloudflare D1 Database** | `sr-workspace-d1` | `sr-workspace-staging-d1` |
| **Database ID Binding** | Production D1 UUID | `<STAGING_D1_DATABASE_ID_REQUIRED>` (Operator-bound) |
| **JWT Secret Enforcement** | Mandatory runtime secret (`JWT_SECRET`) | Mandatory runtime secret (`JWT_SECRET`) – Fails closed (500) |
| **Cookie Flags** | `Secure`, `HttpOnly`, `SameSite=Lax` | `Secure`, `HttpOnly`, `SameSite=Lax` |
| **CORS Policy** | Whitelisted strictly to production origin | Whitelisted strictly to staging origin (Localhost rejected) |
| **CSRF Policy** | Enforced match on production origin | Enforced match on staging origin (Localhost rejected) |

---

## 3. Detailed Implementation Changes

### 3.1 Frontend API Configuration (`apps/web`)

1. **Configurable Base URL (`apps/web/src/lib/api-client.ts`)**:
   - Implemented `getApiBaseUrl()` reading `import.meta.env.VITE_API_BASE_URL`.
   - Implemented `resolveApiUrl(path)` which normalizes leading/trailing slashes to ensure neither missing slashes nor double-prefixes (`//`) occur.
   - Preserves relative paths (`/api/v1/...`) in local development when `VITE_API_BASE_URL` is omitted.
   - Updated both standard API requests and the internal session refresh routine (`refreshSessionInternal()`) to route through `resolveApiUrl()`.
   - Guaranteed `credentials: 'include'` is preserved across all fetch calls for HttpOnly cookie propagation.

2. **TypeScript Environment Typing (`apps/web/src/vite-env.d.ts`)**:
   - Created type declarations for `ImportMetaEnv` declaring `readonly VITE_API_BASE_URL?: string`.

3. **Staging Environment Template (`apps/web/.env.staging.example`)**:
   - Documented `VITE_API_BASE_URL=https://api-staging-workspace.srcodelab.space`.
   - Updated `.gitignore` to allow tracking `!.env.*.example` while strictly ignoring live `.env.*` secrets.

4. **Staging Build Script (`apps/web/package.json`)**:
   - Added `"build:staging": "tsc --noEmit && vite build --mode staging"` to trigger Vite with staging environment overrides.

### 3.2 Authentication Secret Enforcement & Fail-Closed Architecture (`apps/api`)

1. **Cryptographic Secret Resolution (`apps/api/src/lib/crypto.ts`)**:
   - Implemented `getJwtSecret(env)` helper:
     ```typescript
     export function getJwtSecret(env: Record<string, any>): string {
       const secret = env.JWT_SECRET;
       if (secret && typeof secret === 'string' && secret.trim().length > 0) {
         return secret;
       }
       if (env.APP_ENV === 'development') {
         return DEFAULT_DEV_JWT_SECRET;
       }
       throw {
         code: 'AUTH_CONFIG_ERROR',
         message: 'JWT_SECRET is required in production and staging environments.',
         status: 500,
       };
     }
     ```
   - In any non-development environment (`staging`, `production`), the API refuses to start authentication flows with fallback secrets and fails closed with a secure HTTP 500 `AUTH_CONFIG_ERROR`.

2. **Controller & Middleware Hardening**:
   - Updated `apps/api/src/middleware/auth.ts` (`authMiddleware` and `optionalAuthMiddleware`) to invoke `getJwtSecret(c.env)`.
   - Updated `apps/api/src/modules/auth/auth.controller.ts` (`/login`, `/register`, `/refresh`) to dynamically pull `getJwtSecret(c.env)`.
   - Refactored `apps/api/src/modules/auth/auth.service.ts` so `login()`, `register()`, and `refreshSession()` strictly require `jwtSecret: string` without hardcoded fallback parameters.

### 3.3 Staging Worker & Environment Configuration (`apps/api/wrangler.jsonc`)

- Added isolated `"env": { "staging": { ... } }` block:
  - Worker Name: `sr-workspace-api-staging`
  - D1 Database Binding: `sr-workspace-staging-d1` (`database_id: "<STAGING_D1_DATABASE_ID_REQUIRED>"`)
  - `APP_ENV`: `"staging"`
  - `APP_NAME`: `"SR WORKSPACE API (Staging)"`
  - `APP_ORIGIN`: `"https://staging-workspace.srcodelab.space"`
  - Preserved compatibility flags and root configuration without touching production bindings.

### 3.4 CORS, CSRF, and Cookie Security Hardening (`apps/api`)

1. **CORS Middleware (`apps/api/src/app.ts`)**:
   - In staging and production environments, `origin` validation strictly compares against `c.env.APP_ORIGIN`.
   - Localhost (`localhost:5173`, `127.0.0.1`) is exclusively permitted when `APP_ENV === 'development'` or `APP_ENV === 'test'`.
   - Requests from untrusted origins receive `null` for `Access-Control-Allow-Origin`.

2. **CSRF Middleware (`apps/api/src/middleware/csrf.ts`)**:
   - State-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) require the `Origin` or `Referer` header to match `c.env.APP_ORIGIN`.
   - Localhost bypass is restricted exclusively to `development` and `test` environments. Staging rejects non-staging origins with 403 `CSRF_FORBIDDEN`.

3. **Secure Cookies (`apps/api/src/lib/cookies.ts`)**:
   - `isSecureEnvironment(c)` now returns `true` for both `production` and `staging`.
   - All session cookies (`sr_access`, `sr_refresh`) are issued with `Secure`, `HttpOnly`, and `SameSite=Lax` in staging.

### 3.5 Security Observations Remediation (OBS-1 to OBS-6)

| Observation | Severity | Module / Location | Description & Remediation Applied |
| :--- | :--- | :--- | :--- |
| **OBS-1** | Medium | `apps/api/src/middleware/rbac.ts` | **Administrative Permission Scoping:** Added explicit exclusion so administrative `:read` permissions (such as `hr_reports:read` and `admin:*`) cannot be bypassed via standard employee `:read` fallback. |
| **OBS-2** | Medium | `apps/api/src/modules/hr/hr.controller.ts` | **Employee Record Access Bounds:** Added ownership validation on `GET /employees/:employeeId/lifecycle`, `/documents`, `/exit-checklist`, `/shifts`, and `/leave/balances/:employeeId`. Callers can access only their own records unless holding HR/Administrative permissions (`hr:read` / `hr:write`). |
| **OBS-3** | Low | `apps/api/src/modules/hr/hr.service.ts` | **Designated Manager Reviewer Enforcement:** In `submitPerformanceReview`, verified that when `input.type === 'MANAGER'`, the acting employee must match `rev.reviewerEmployeeId` (or have administrative permissions), preventing arbitrary employees from submitting manager reviews. |
| **OBS-4** | Low | `apps/api/src/modules/hr/hr.service.ts` | **Anti-Conflict Self-Approval Prevention:** Enforced that acting reviewers cannot approve their own leave applications (`approveLeaveRequest`) or attendance regularization requests (`updateRegularization`), returning 403 `SELF_APPROVAL_FORBIDDEN`. |
| **OBS-5** | Low | `apps/api/src/modules/hr/hr.service.ts` | **Bounded Shift Overlap Prevention:** Enhanced `assignShift` overlap validation using SQL intervals to detect and reject overlapping bounded shifts with 409 `SHIFT_ASSIGNMENT_OVERLAP`. |
| **OBS-6** | Low | `apps/api/src/modules/hr/hr.service.ts` | **HR Audit Trail Integrity:** Added secondary `auditLogs` row insertions upon leave approval, rejection, and cancellation, capturing the actor ID, entity ID, previous status, and review notes. |

---

## 4. Verification & Testing Results

### 4.1 Automated Test Execution (`pnpm test`)

A dedicated test suite `apps/api/tests/staging-readiness.test.ts` was authored containing 15 automated test cases covering secret enforcement fail-closed behavior, CORS/CSRF staging isolation, cookie security flags, and all six security remediations.

All 16 test suites across the monorepo executed successfully:

```text
 ✓ tests/staging-readiness.test.ts (15 tests)
 ✓ tests/security-hardening.test.ts (11 tests)
 ✓ tests/hr-security-audit.test.ts (6 tests)
 ✓ tests/communication-security-audit.test.ts (8 tests)
 ✓ tests/communication-frontend-integration.test.ts (9 tests)
 ✓ tests/communication-api.test.ts (12 tests)
 ✓ tests/hr-api.test.ts (9 tests)
 ✓ tests/employees.test.ts (7 tests)
 ✓ tests/hr-schema-integrity.test.ts (6 tests)
 ✓ tests/projects.test.ts (6 tests)
 ✓ tests/tasks.test.ts (5 tests)
 ✓ tests/departments-response.test.ts (4 tests)
 ✓ tests/departments.test.ts (6 tests)
 ✓ tests/auth.test.ts (10 tests)
 ✓ tests/health.test.ts (2 tests)
 ✓ tests/tenant.test.ts (5 tests)

 Test Files  16 passed (16)
      Tests  121 passed (121)
   Duration  17.56s
```

### 4.2 Static Typecheck (`pnpm typecheck`)

TypeScript type validation executed across all workspaces (`packages/database`, `apps/web`, `apps/api`):

```text
packages/database typecheck: Done (0 errors)
apps/web typecheck: Done (0 errors)
apps/api typecheck: Done (0 errors)
```

### 4.3 Production & Staging Bundling (`pnpm build`)

```text
packages/database build: Done
apps/api build: Done
apps/web build (staging): built in 15.22s (dist generated cleanly)
apps/web build (production): built in 18.50s (dist generated cleanly)
```

---

## 5. Deployment Blockers & Manual Prerequisites

The following operational resources must be created and configured in Cloudflare by an authorized operator before executing the deployment:

1. **Cloudflare Staging D1 Database Creation**:
   - The staging database `sr-workspace-staging-d1` must be provisioned.
   - Command:
     ```bash
     pnpm --filter @sr-workspace/api wrangler d1 create sr-workspace-staging-d1
     ```
   - The generated `database_id` UUID must replace `<STAGING_D1_DATABASE_ID_REQUIRED>` in `apps/api/wrangler.jsonc` under `env.staging.d1_databases[0]`.

2. **Staging JWT Secret Provisioning**:
   - A cryptographically secure random string (minimum 32 characters) must be set as a Worker secret.
   - Command:
     ```bash
     pnpm --filter @sr-workspace/api wrangler secret put JWT_SECRET --env staging
     ```

3. **Cloudflare Pages Staging Project**:
   - A Cloudflare Pages project named `sr-workspace-web-staging` must be connected to the repository's `staging` branch.
   - Build command: `pnpm --filter @sr-workspace/web build:staging`
   - Build output directory: `apps/web/dist`
   - Environment variables: `VITE_API_BASE_URL=https://api-staging-workspace.srcodelab.space`

4. **DNS Custom Domains**:
   - CNAME `api-staging-workspace.srcodelab.space` bound to the staging Worker.
   - CNAME `staging-workspace.srcodelab.space` bound to the Cloudflare Pages staging project.

---

## 6. Step-by-Step Operator Runbook

Once the prerequisites in Section 5 are fulfilled, execute the following commands in sequence:

### Step 1: Create Remote Staging D1 Database & Update Wrangler Config
```bash
# Provision the staging D1 database
pnpm --filter @sr-workspace/api wrangler d1 create sr-workspace-staging-d1

# Note the returned database_id and update apps/api/wrangler.jsonc:
# "database_id": "<NEW_STAGING_D1_UUID>"
```

### Step 2: Set Staging Secrets
```bash
# Set high-entropy JWT secret on the staging worker
pnpm --filter @sr-workspace/api wrangler secret put JWT_SECRET --env staging
```

### Step 3: Apply Database Migrations to Staging D1
```bash
# Execute baseline through Milestone 7 migrations against the staging D1 database
pnpm --filter @sr-workspace/api wrangler d1 migrations apply sr-workspace-staging-d1 --remote
```

### Step 4: Deploy the Staging Worker API
```bash
# Deploy the API Worker to Cloudflare staging environment
pnpm --filter @sr-workspace/api wrangler deploy --env staging
```

### Step 5: Build & Deploy Frontend to Cloudflare Pages (Staging)
```bash
# Build the web application with staging configuration
pnpm --filter @sr-workspace/web build:staging

# Deploy to Cloudflare Pages staging project
pnpm dlx wrangler pages deploy apps/web/dist --project-name sr-workspace-web-staging --branch staging
```

---

## 7. Conclusion & Sign-Off

The SR WORKSPACE codebase on branch `staging` is completely prepared, hardened, and verified for isolated staging deployment. Zero production resources were modified. All tests pass with 100% success.
