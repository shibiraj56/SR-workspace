# SR WORKSPACE – Existing Architecture Specification

**Document Version:** 2.0.0 (Final Web-Only Scope)  
**Date:** November 23, 2026  
**Author:** Lead Software Architect, SR CODE LABS  
**Target Audience:** Engineering Team & Technical Stakeholders  
**Production URL:** `workspace.srcodelab.space`  
**Scope:** Architectural blueprint of the existing `sr-one` monorepo baseline and final target delineation

---

## 1. High-Level Architecture Overview

The existing codebase was constructed as an Enterprise Resource Planning (ERP) platform (`sr-one`) designed for containerized deployment with Node.js and PostgreSQL.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Active Client Layer: Web Application                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │   Web App (React 18 + Vite + TypeScript)                         │  │
│  │   Tailwind CSS + Radix UI Primitives                             │  │
│  │   Responsive layout for standard desktop browser use             │  │
│  │   Target Production URL: workspace.srcodelab.space               │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│  [Note: Legacy apps/desktop Tauri 2 preserved dormant; no active dev]  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │  HTTPS / REST (JSON API)
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer (NestJS 10)                      │
│     [Target Migration: Cloudflare Workers + Hono API Framework]        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Global Middleware: CORS, Helmet, Throttler Rate Limiting         │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Guards: JwtAuthGuard, RolesGuard, TenantGuard                    │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Controllers: Auth, Users, Roles, Tenants, Orgs, Branches, Audit  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Domain Services: Business Logic & Data Transformation            │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Data Access: PrismaService (Prisma Client 5.22.0)                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SQL (TCP connection)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Persistence & Storage                           │
│     [Target Migration: Cloudflare D1 (SQLite) + Drizzle ORM]           │
│  ┌──────────────────────────────┐      ┌────────────────────────────┐  │
│  │   PostgreSQL 18 Database     │      │   Local Server Disk        │  │
│  │   (Relational Data & RBAC)   │      │   (Multer File Uploads)    │  │
│  └──────────────────────────────┘      └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Hierarchy & Module Dependencies

The monorepo uses `pnpm workspaces`. Dependencies flow strictly from shared packages into application entry points:

```
apps/web (React + Vite) ──────┐
                              ├──► packages/ui (Radix UI / Tailwind)
                              ├──► packages/validation (Zod Schemas)
apps/api (NestJS / Hono)──────┼──► packages/types (Shared TypeScript Interfaces)
                              └──► packages/config (Environment Schemas)
```

*(Note: `apps/desktop` remains in the tree as legacy reference code without active dependencies or build targets.)*

### Module Breakdown:
1. **`apps/api` (API Gateway):**
   - Existing: Node.js 22 + NestJS 10 + Express 4.
   - Target: Cloudflare Workers + Hono (`hono@^4.6.0`).
2. **`apps/web` (Web Frontend):**
   - Single-page web application bundled with Vite.
   - Client-side routing via React Router DOM.
   - Styling handled via Tailwind utility classes and shared UI primitives from `@sr-one/ui`.
   - Layout optimized for desktop browser experiences.
3. **`apps/desktop` (Preserved Legacy):**
   - Tauri 2 Rust wrapper. Preserved intact without deletion, but fully excluded from future feature development.

---

## 3. Request Lifecycle & Security Data Flow

Every HTTP request to `apps/api` traverses a standardized pipeline:

```
HTTP Request (from Browser: workspace.srcodelab.space)
     │
     ▼
[ Cloudflare Edge / Workers Runtime ]
     │
     ▼
[ Rate Limiting / CORS Middleware ]
     │
     ▼
[ JWT Authentication Middleware ] ──► (Validates Authorization: Bearer <JWT>)
     │                                 (Populates context with UserId, TenantId)
     ▼
[ Roles & Permissions Guard ] ──► (Validates user privileges)
     │
     ▼
[ Zod Request Validator ] ──► (Validates input payloads)
     │
     ▼
[ Hono Route Handler / Service ] ──► (Executes business rules)
     │
     ▼
[ Drizzle ORM ] ──► (Queries Cloudflare D1 SQLite database)
     │
     ▼
HTTP Response (JSON)
```

---

## 4. API Route & Controller Inventory

The existing backend exposes 32 REST endpoints under the `/api/v1` namespace across Auth, Tenants, Organisations, Branches, Users, Roles, Subscriptions, Licences, Audit, Notifications, and Files.

All functional endpoints are being mapped into modular Hono sub-routers within `apps/api/src/routes`.

---

## 5. Database Schema & Data Models (PostgreSQL + Prisma)

The existing schema (`prisma/schema.prisma`) comprises 18 relational models with extensive foreign key constraints and enums:
- `Tenant`, `TenantSetting`
- `Organisation`, `Branch`
- `User`, `UserTenant`, `RefreshToken`
- `Role`, `Permission`, `RolePermission`, `UserRole`
- `Module`, `TenantModule`
- `SubscriptionPlan`, `Subscription`, `Licence`
- `AuditLog`, `Notification`, `FileRecord`

These models form the direct basis for the Cloudflare D1 + Drizzle ORM schema.
