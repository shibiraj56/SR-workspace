# SR WORKSPACE – Comprehensive Project Audit

**Document Version:** 2.0.0 (Final Web-Only Scope)  
**Date:** November 23, 2026  
**Author:** Lead Software Architect, SR CODE LABS  
**Repository Context:** Monorepo (`sr-one` baseline transitioned to `SR WORKSPACE`)  
**Production URL:** `workspace.srcodelab.space`  
**Approved Architecture:**
- **Product Scope:** Exclusively a browser-based web application with responsive layout for standard desktop browser use.
- **Frontend:** React 18+ + TypeScript + Vite + Tailwind CSS.
- **Backend:** Cloudflare Workers + TypeScript + Hono API framework.
- **Database:** Cloudflare D1 (Serverless SQLite) + Drizzle ORM.
- **Infrastructure:** Cloudflare Pages (Frontend) + Cloudflare Workers (Backend) + Cloudflare R2 (Object storage when needed).
- **Explicit Exclusions:** No mobile application, no PWA or installable application, no service workers, no desktop application development, no Tauri/Rust development. Existing legacy desktop files are preserved as dormant reference assets without active development or deletion.

---

## Executive Summary

An exhaustive technical audit of the existing repository was conducted to assess baseline architecture, code assets, module completeness, and migration readiness for **SR WORKSPACE**—the browser-based business collaboration platform with future multi-company SaaS capabilities.

The existing codebase was initially prototyped under the name **SR One** (`sr-one`), targeting a traditional containerized stack (Node.js 22, NestJS 10, PostgreSQL 18, and Prisma ORM). While the administrative core (authentication, tenant/organization hierarchies, and role-based access control) has functional baseline implementations across frontend and backend, the core business collaboration modules (**Employee directory, Project management, Task tracking, and Team Communication**) are completely unbuilt.

Per executive direction, the platform scope has been strictly defined as **exclusively a browser-based web application**. Development of desktop wrappers (Tauri/Rust) and mobile applications/PWAs is discontinued. Existing desktop source files are preserved untouched as legacy reference code.

---

## 1. Monorepo Structure & Tooling

### 1.1 Repository Layout
The project uses a **pnpm workspace** configuration with the following structure:

```
SR WORKSPACE / sr-one
├── apps/
│   ├── api/             # NestJS 10 REST API (to be migrated to Cloudflare Workers + Hono)
│   ├── web/             # React 18 + Vite + Tailwind CSS web application (Active Target)
│   ├── desktop/         # Legacy Tauri 2 desktop app (Preserved; no active development)
│   └── worker/          # Empty directory (placeholder)
├── packages/
│   ├── api-client/      # Axios + TanStack Query HTTP client
│   ├── config/          # Shared environment configurations and constants
│   ├── types/           # Shared TypeScript domain interfaces
│   ├── ui/              # Shared React component library (Radix UI + Tailwind)
│   └── validation/      # Shared Zod validation schemas
├── modules/             # Placeholder directories for industry verticals (all empty)
│   ├── core/
│   ├── platform/
│   └── industries/      # construction, education, garments, healthcare, manufacturing, retail
├── prisma/              # Prisma schema, migrations, and seed scripts (legacy PostgreSQL)
├── infrastructure/      # Docker Compose, Dockerfiles, and Nginx configurations
├── docs/                # Architecture, API, database, and setup documentation
├── tests/               # Empty directory (no E2E or automated integration suites)
├── .env.example         # Template environment variables
├── package.json         # Root workspace scripts and dependencies
├── pnpm-workspace.yaml  # Monorepo workspace definitions
└── tsconfig.json        # Base TypeScript compiler options
```

### 1.2 Package Manager and Toolchain
- **Package Manager:** `pnpm@12.16.1` (configured via `packageManager` field in root `package.json`).
- **Node Engine Requirement:** `>=22.0.0`.
- **TypeScript:** Version `5.7.2` configured with strict compiler flags across all packages.
- **Linters & Formatters:** ESLint `9.17.0` (flat config format in `eslint.config.js`), Prettier `3.4.2`, Husky `9.1.7`, and Lint-Staged `15.2.11`.
- **Build Orchestration:** Root scripts utilize `pnpm -r` (recursive) and `pnpm --filter <app>` patterns.

---

## 2. Inventory of Existing Applications

### 2.1 Web Application (`apps/web`) – Primary Focus
- **Framework:** React `18.3.1`, TypeScript, Vite `6.0.3`.
- **Styling:** Tailwind CSS `3.4.16`, PostCSS, Autoprefixer, `tailwind-merge`, and `clsx`.
- **Routing:** `react-router-dom` `7.0.2`.
- **State Management & Data Fetching:** TanStack React Query `5.62.7`.
- **Forms & Validation:** `react-hook-form` `7.54.0` with `@hookform/resolvers` and `zod` `3.24.1`.
- **Icons:** `lucide-react` `0.468.0`.
- **Existing Page Implementations (`apps/web/src/pages`):**
  - `Login.tsx` (5.7 KB): Email/password authentication, validation, error handling, redirect to dashboard.
  - `Register.tsx` (8.4 KB): Multi-step tenant and administrator onboarding.
  - `Dashboard.tsx` (11.7 KB): Operational metrics, user counts, system status cards, quick links.
  - `Users.tsx` (4.7 KB): User listing, status badges, create/edit modal trigger.
  - `Roles.tsx` (6.3 KB): Role management, permission matrix checklist.
  - `Organisations.tsx` (4.3 KB): Multi-organization tree and branch view.
  - `Settings.tsx` (16.0 KB): Tenant profile, security preferences, session expiration, branding.
  - `Profile.tsx` (9.2 KB): Current user personal info, password update.
  - `Help.tsx` (9.3 KB): Support documentation, FAQs, contact cards.
  - `NotFound.tsx` (1.5 KB): Fallback 404 handler.
- **Scope Note:** Designed with a responsive desktop browser layout. No mobile viewport wrappers, no PWA manifest, and no service workers will be added.

### 2.2 Desktop Application (`apps/desktop`) – Preserved Dormant
- **Framework:** Tauri 2 (`@tauri-apps/api` `2.1.1`, `@tauri-apps/cli` `2.1.0`).
- **Native Backend (Rust):** `apps/desktop/src-tauri/src/main.rs`.
- **Status:** **Preserved untouched.** In accordance with strict requirements, no further Tauri or Rust development will take place. Files remain in place to protect legacy work.

### 2.3 API Gateway (`apps/api`) – Migration Target
- **Framework:** NestJS `10.4.8`, TypeScript, `@nestjs/platform-express`.
- **Architecture:** Classical NestJS modular architecture with Dependency Injection, Controllers, Services, DTOs, Guards, and Decorators.
- **Target Replacement:** Lightweight Cloudflare Workers API powered by Hono (`hono@^4.6.0`).

### 2.4 Background Worker (`apps/worker`)
- **Status:** **Empty directory.** No code or queue infrastructure was implemented.

---

## 3. Inventory of Shared Packages (`packages/`)

| Package | Purpose | Core Dependencies | Reusability in Target Architecture |
|---|---|---|---|
| `@sr-one/ui` (`packages/ui`) | Shared UI component library | React, Radix UI primitives, Tailwind CSS, Lucide | **100% Reusable** for the web application |
| `@sr-one/types` (`packages/types`) | Domain model type definitions | Pure TypeScript | **85% Reusable** (adapted for SQLite/D1 data types) |
| `@sr-one/validation` (`packages/validation`) | Input validation schemas | Zod `3.24.1` | **95% Reusable** (compatible directly with `@hono/zod-validator`) |
| `@sr-one/api-client` (`packages/api-client`) | Frontend API communication | Axios `1.7.9`, TanStack Query | **75% Reusable** (will use native `fetch` or Hono RPC) |
| `@sr-one/config` (`packages/config`) | Environment & constant configs | Zod, dotenv | **50% Reusable** (migrated to Workers environment bindings) |

---

## 4. Backend Architecture & Existing APIs

The existing NestJS backend routes all traffic through `AppModule` (`apps/api/src/app.module.ts`). The table below catalogs every implemented module and its REST endpoints:

| Domain Module | Primary Controller | Key Endpoints | Implementation Status |
|---|---|---|---|
| **Health** | `HealthController` | `GET /api/v1/health` | Operational (Terminus + Prisma check) |
| **Auth** | `AuthController` | `POST /api/v1/auth/register`<br>`POST /api/v1/auth/login`<br>`POST /api/v1/auth/refresh`<br>`POST /api/v1/auth/logout`<br>`GET /api/v1/auth/me` | Operational (JWT + Refresh tokens) |
| **Tenants** | `TenantsController` | `GET /api/v1/tenants`<br>`POST /api/v1/tenants`<br>`GET /api/v1/tenants/:id`<br>`PUT /api/v1/tenants/:id`<br>`DELETE /api/v1/tenants/:id` | Operational (CRUD with slug uniqueness) |
| **Organisations**| `OrganisationsController`| `GET /api/v1/organisations`<br>`POST /api/v1/organisations`<br>`GET /api/v1/organisations/:id`<br>`PUT /api/v1/organisations/:id` | Operational (Tenant-scoped) |
| **Branches** | `BranchesController` | `GET /api/v1/branches`<br>`POST /api/v1/branches`<br>`GET /api/v1/branches/:id`<br>`PUT /api/v1/branches/:id` | Operational (Org-scoped physical branches) |
| **Users** | `UsersController` | `GET /api/v1/users`<br>`POST /api/v1/users`<br>`GET /api/v1/users/:id`<br>`PUT /api/v1/users/:id`<br>`POST /api/v1/users/:id/roles` | Operational (User CRUD + role assignment) |
| **Roles** | `RolesController` | `GET /api/v1/roles`<br>`POST /api/v1/roles`<br>`GET /api/v1/roles/:id`<br>`PUT /api/v1/roles/:id` | Operational (RBAC permission matrix) |
| **Modules** | `ModulesController` | `GET /api/v1/modules`<br>`POST /api/v1/modules/toggle` | Operational (System feature flag toggles) |
| **Subscriptions**| `SubscriptionsController`| `GET /api/v1/subscriptions`<br>`POST /api/v1/subscriptions/plan` | Operational (Plan tiers & billing status) |
| **Licences** | `LicencesController` | `GET /api/v1/licences`<br>`POST /api/v1/licences/validate` | Operational (Seat-based licensing) |
| **Audit** | `AuditController` | `GET /api/v1/audit`<br>`GET /api/v1/audit/entity/:id` | Operational (Immutable event logging) |
| **Notifications**| `NotificationsController`| `GET /api/v1/notifications`<br>`PATCH /api/v1/notifications/:id/read` | Operational (Basic database notifications) |
| **Files** | `FilesController` | `POST /api/v1/files/upload`<br>`GET /api/v1/files/:id` | Local disk storage via Multer |

---

## 5. Existing Authentication Implementation

- **Mechanisms:** JWT access tokens (15-minute expiration) paired with cryptographically generated refresh tokens (7-day expiration).
- **Password Hashing:** `bcrypt` (`^6.0.0`) with 10 salt rounds.
- **NestJS Passport Strategies:**
  - `LocalStrategy`: Validates email/password credentials during `POST /auth/login`.
  - `JwtStrategy`: Decodes `Authorization: Bearer <token>` headers and attaches the `User` payload to `req.user`.
  - `RefreshTokenStrategy`: Validates hashed refresh tokens stored in the `RefreshToken` database table.
- **Authorization:** Custom `@Roles(...)` decorator combined with a NestJS `RolesGuard` checking `UserRole` and granular permissions.
- **Incompatibility Note for Cloudflare Workers:** `bcrypt` relies on native C++ bindings that cannot compile to or execute within the Cloudflare Workers V8 isolate environment. Migrating to `bcrypt-ts` and standard Web Crypto API (`crypto.subtle`) with `hono/jwt`.

---

## 6. Database Schema & Migration Review

- **Database Engine:** PostgreSQL (targeted at PostgreSQL 18).
- **ORM:** Prisma `5.22.0`.
- **Prisma Schema:** `prisma/schema.prisma` (19.1 KB).
- **Initial Migration:** `prisma/migrations/20261116193949_init/migration.sql` (25.1 KB).
- **Key Tables in Schema:**
  - `Tenant` & `TenantSetting`: Multi-tenancy isolation and per-tenant config.
  - `Organisation` & `Branch`: Hierarchical business units.
  - `User`, `UserTenant`, `RefreshToken`: Authentication and tenant-membership mapping.
  - `Role`, `Permission`, `RolePermission`, `UserRole`: Granular RBAC system.
  - `Module`, `TenantModule`: Modular feature entitlement flags.
  - `SubscriptionPlan`, `Subscription`, `Licence`: Commercial billing and licensing.
  - `AuditLog`: Action tracking (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `EXPORT`).
  - `Notification`: User notifications with read/unread status.
  - `FileRecord`: Metadata for uploaded assets.
- **Seeding:** `prisma/seed.ts` (21.7 KB) and root `seed.js` populate default roles (`SUPER_ADMIN`, `TENANT_ADMIN`, `ORG_ADMIN`, `BRANCH_MANAGER`, `EMPLOYEE`, `VIEWER`), 48 granular permissions, and system modules.

---

## 7. Business Collaboration Modules Audit

One of the primary objectives of the audit was to inspect the existing implementations for **Employee, Project, Task, and Communication** modules:

| Required Module | Existing State in Repository | Findings & Gaps |
|---|---|---|
| **Employee Module** | **Missing** | Only a generic `User` table exists. There is no employee profile, department hierarchy, designation, joining date, reporting manager, attendance, or leave model. |
| **Project Module** | **Missing** | Zero project tables, DTOs, controllers, or frontend views exist. No project lifecycle, milestone, budget, or member assignment. |
| **Task Module** | **Missing** | Zero task tables, kanban boards, priority queues, status workflows, or assignment logic exist. |
| **Communication Module** | **Missing** | No chat, messaging channels, direct messages, comments, or threads. Only a standard system `Notification` table exists. |

> **Architectural Conclusion:** The existing repository is strictly a **Platform Foundation** (Auth, Tenants, Roles, Permissions, System Settings). The entire business collaboration suite must be architected and developed from the ground up for SR WORKSPACE.

---

## 8. Client Platforms Assessment (Final Scope Decision)

- **Web Application:** Single target delivery platform. Responsive desktop browser layout hosted at `workspace.srcodelab.space`.
- **Desktop Application (Tauri 2):** Discontinued. Existing files in `apps/desktop` preserved untouched without active development.
- **Mobile Application / PWA:** Completely out of scope. No mobile-specific build targets, no service workers, no Web App Manifest.

---

## 9. Technical Debt & Incompatibilities Summary

1. **NestJS Framework Overhead:** NestJS is tightly coupled to Node.js runtime APIs, `express`, `reflect-metadata`, and dynamic class reflection. Migrating to Hono on Cloudflare Workers.
2. **C++ Native Addons in Auth:** `bcrypt` cannot execute in V8 isolates. Migrating to `bcrypt-ts`.
3. **Prisma ORM on Edge:** Prisma's query engine binary is not compatible with Cloudflare D1. Migrating to Drizzle ORM (`drizzle-orm/d1`).
4. **Local Disk Storage:** `apps/api/src/files` writes files to a local directory via Multer. Migrating to Cloudflare R2.
5. **No Test Suites:** `tests/` directory is empty. Automated testing suite with Vitest will be established during the migration.
6. **Abandoned ERP Vertical Folders:** `modules/industries/*` contain empty directories that add clutter without value.
