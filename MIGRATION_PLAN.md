# SR WORKSPACE – Architecture Migration Plan

**Document Version:** 2.0.0 (Final Web-Only Scope)  
**Date:** November 23, 2026  
**Author:** Lead Software Architect, SR CODE LABS  
**Production URL:** `workspace.srcodelab.space`  
**Scope:** Migration from Legacy Stack (Node.js/NestJS/Prisma/PostgreSQL) to Approved Modern Web Stack (Cloudflare Workers/Hono/D1/Drizzle/React/Tailwind)

---

## 1. Migration Overview & Strategic Motivation

The existing `sr-one` baseline was built on a monolithic Node.js container stack (NestJS, Prisma, PostgreSQL). Moving to the approved Cloudflare serverless edge architecture for the browser-based web application delivers:

1. **Global Low-Latency Execution:** Cloudflare Workers run within 50ms of 95% of the world's connected population, eliminating single-region roundtrip delays.
2. **Sub-Millisecond Cold Starts:** Unlike NestJS container instances which take 3–8 seconds to cold-start, Cloudflare V8 Workers initialize in under 5 milliseconds.
3. **Zero Server Maintenance:** Eliminates Docker daemon management, Linux OS patching, database container connection pooling, and VPS provisioning.
4. **Unified TypeScript Edge Ecosystem:** Frontend (React + Vite) and Backend (Hono + Workers) share TypeScript types, Zod validation schemas, and web standards.
5. **Strict Scope Focus (Web-Only):** By eliminating mobile/PWA overhead and desktop (Tauri/Rust) complexity, engineering bandwidth is 100% focused on delivering a world-class browser application for `workspace.srcodelab.space`.

---

## 2. Incompatible Dependencies & Replacement Matrix

Cloudflare Workers run on the **V8 Isolate** engine, not Node.js. Node-specific native C++ bindings, non-standard globals, and local filesystem access are incompatible.

| Component / Layer | Existing Legacy Dependency | Replacement Dependency | Reason for Incompatibility & Migration Strategy |
|---|---|---|---|
| **API Framework** | `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | `hono` (`^4.6.0`) | NestJS relies on Node.js reflection (`reflect-metadata`), Express, and dynamic class loaders incompatible with V8 isolates. Hono is ultra-lightweight (<15KB) and built natively for Web Standards (`Request`/`Response`). |
| **Database Engine** | PostgreSQL 18 (`sr-one-postgres`) | Cloudflare D1 (Serverless SQLite) | Traditional TCP-based PostgreSQL connection pools cannot run efficiently on serverless edge isolates without Hyperdrive. D1 provides native edge SQLite storage. |
| **ORM Layer** | `prisma` & `@prisma/client` (`5.22.0`) | `drizzle-orm` (`^0.38.0`) + `drizzle-kit` | Prisma's query engine binary is too large and heavy for Cloudflare Workers. Drizzle compiles to lightweight raw SQL with zero runtime overhead and first-class `drizzle-orm/d1` driver support. |
| **Password Hashing** | `bcrypt` (`^6.0.0`) | `bcrypt-ts` or Web Crypto API (`crypto.subtle`) | Native C++ bindings in `bcrypt` fail to compile in V8. `bcrypt-ts` is 100% pure TypeScript/Wasm and runs seamlessly in Workers. |
| **JWT Authentication** | `@nestjs/jwt`, `passport`, `passport-jwt` | `hono/jwt` or `jose` (`^5.9.0`) | Passport is tied to Express session/request structures. Hono provides built-in `jwt()` middleware based on standard Web Crypto API. |
| **Input Validation** | `class-validator`, `class-transformer` | `@hono/zod-validator` + `zod` (`3.24.1`) | Class-validator relies on TypeScript experimental decorators. Hono integrates natively with existing Zod schemas in `packages/validation`. |
| **File Storage** | `multer` (Local Disk Storage) | Cloudflare R2 (`@cloudflare/workers-types`) | Workers do not have a persistent local filesystem. Multer fails on edge. R2 provides S3-compatible, zero-egress-fee distributed object storage. |
| **Rate Limiting** | `@nestjs/throttler` (In-memory/Redis) | Cloudflare Workers Rate Limiting API or Durable Objects | Traditional Redis connections require TCP. Cloudflare provides native edge rate limiting bindings or Durable Objects counters. |
| **Health Checks** | `@nestjs/terminus` | Custom Hono health route (`/api/v1/health`) | Simple D1 query test (`SELECT 1`) via Hono route replaces bloated Terminus dependencies. |

---

## 3. Database Migration: PostgreSQL/Prisma to Cloudflare D1/Drizzle

### 3.1 Data Type & Engine Mapping

| PostgreSQL Feature / Type | Cloudflare D1 (SQLite) Equivalent | Drizzle ORM Schema Implementation |
|---|---|---|
| `UUID` (`gen_random_uuid()`) | `text` (UUID string) | `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())` |
| Native `ENUM` (e.g. `UserStatus`) | `text` with `CHECK` constraint | `text('status', { enum: ['ACTIVE', 'INACTIVE', 'INVITED', 'LOCKED'] }).notNull().default('ACTIVE')` |
| `TIMESTAMPTZ` (`now()`) | `integer` (Epoch ms) or `text` (ISO-8601) | `integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())` |
| `JSONB` | `text` with JSON mode | `text('metadata', { mode: 'json' })` |
| `BOOLEAN` | `integer` (0 or 1) | `integer('is_active', { mode: 'boolean' }).notNull().default(true)` |
| Foreign Key `ON DELETE CASCADE` | Supported natively in SQLite | `.references(() => tenants.id, { onDelete: 'cascade' })` |

### 3.2 Multi-Tenancy Architecture on Cloudflare D1
- **Approach:** Shared D1 database with strict `tenant_id` tenant-isolation discriminator and query middleware.
- **Enforcement:** A custom Hono middleware extracts `tenantId` from the verified JWT and injects an isolated context helper `c.var.tenantId`. All Drizzle repository queries automatically apply `.where(eq(schema.table.tenantId, tenantId))`.

---

## 4. Scope Exclusions & Deprecations

Per executive direction:
- **No Mobile Application:** No React Native, Capacitor, or mobile shell will be developed.
- **No PWA / Service Worker:** No Web App Manifest, no service worker registration, and no offline caching infrastructure.
- **No Desktop Application:** No Tauri 2 or Rust development. The existing files in `apps/desktop` are preserved without modification or deletion as dormant legacy code.
- **Production Target:** Single responsive browser application deployed to `workspace.srcodelab.space`.
