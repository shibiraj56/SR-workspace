# SR WORKSPACE – Development Roadmap

**Document Version:** 2.0.0 (Final Web-Only Scope)  
**Date:** November 23, 2026  
**Author:** Lead Software Architect, SR CODE LABS  
**Production URL:** `workspace.srcodelab.space`  
**Scope:** Browser-based Web Application (React + Vite + Hono + Cloudflare Workers + Cloudflare D1 + Drizzle)

---

## Roadmap Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ Milestone 1: Database Foundation & Schema Architecture (IN PROGRESS)   │
│ Cloudflare D1 SQLite Schema, Drizzle ORM, Relations, Migrations, Seed  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Milestone 2: Cloudflare Workers + Hono Edge Backend Baseline           │
│ Hono API skeleton, Web Crypto JWT auth, multi-tenant middleware        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Milestone 3: Core Administrative Modules                               │
│ Tenants, Organisations, Branches, Users, RBAC, Audit Logging           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Milestone 4: Business Collaboration Suite                              │
│ Employee Directory, Project Tracking, Task Boards, Team Discussions    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Milestone 5: Web Frontend Integration & Production Deployment          │
│ React + Vite Desktop Browser UI, Cloudflare Pages, workspace.srcodelab.space │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Milestone 1: Database Foundation & Schema Architecture (CURRENT)
*Focus: Defining the complete relational model in Drizzle ORM for Cloudflare D1.*

- [x] Configure `@sr-workspace/database` package structure.
- [x] Define Cloudflare D1 SQLite schemas using `drizzle-orm/sqlite-core`:
  - `tenants` and `tenant_settings`
  - `organisations` and `branches`
  - `users`, `user_tenants`, and `refresh_tokens`
  - `roles`, `permissions`, `role_permissions`, and `user_roles`
  - `audit_logs`
- [x] Establish Drizzle relations across all entities.
- [x] Setup `drizzle.config.ts` for automated D1 migration generation.
- [x] Author database seed script with default roles, 48 granular permissions, and superadmin account.
- [x] Generate initial SQL migration files via `drizzle-kit generate`.

---

## Milestone 2: Cloudflare Workers + Hono Edge Backend Baseline
*Focus: API routing, security, and authentication.*

- [ ] Initialize `apps/api` with Hono framework.
- [ ] Configure `wrangler.jsonc` with Cloudflare D1 binding (`DB`).
- [ ] Implement `bcrypt-ts` password hashing and verification.
- [ ] Implement JWT issuance and verification middleware (`hono/jwt`).
- [ ] Implement multi-tenant isolation middleware (`c.var.tenantId`).
- [ ] Author health check endpoint `GET /api/v1/health` verifying D1 connectivity.

---

## Milestone 3: Core Administrative Modules
*Focus: Tenant management, user onboarding, and access control.*

- [ ] Port Tenant CRUD endpoints and settings.
- [ ] Implement Organisation and Branch management.
- [ ] Implement User management with role assignments.
- [ ] Implement Role and Permission matrix verification (`requirePermission`).
- [ ] Implement automated audit log recording.

---

## Milestone 4: Business Collaboration Suite
*Focus: Delivering the missing business collaboration features.*

- [ ] **Employee Module:** Profiles, departments, designations, and reporting hierarchy.
- [ ] **Project Module:** Project lifecycles, milestones, budgets, and member assignments.
- [ ] **Task Module:** Task boards, statuses, priorities, checklists, and assignments.
- [ ] **Communication Module:** Channels, direct messaging, and discussion threads.

---

## Milestone 5: Web Frontend Integration & Deployment
*Focus: Desktop browser user experience and Cloudflare deployment.*

- [ ] Align React 18 + Vite frontend (`apps/web`) with Hono API endpoints.
- [ ] Refine responsive desktop browser layout with Tailwind CSS.
- [ ] Verify complete user flow from login to collaborative task management.
- [ ] Deploy Cloudflare Pages frontend and Cloudflare Workers API to `workspace.srcodelab.space`.
