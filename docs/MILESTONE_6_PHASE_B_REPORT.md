# SR WORKSPACE – MILESTONE 6: PHASE B FINAL INTEGRITY REPORT
## Database & Schema Verification (Communication & Collaboration Module)

**Company:** SR CODE LABS  
**Product:** SR WORKSPACE  
**Workspace:** `D:\SR WORKSPACE`  
**Production URL:** `https://workspace.srcodelab.space`  
**Milestone:** 6 – Communication & Collaboration  
**Phase:** Phase B – Final Integrity & Schema Audit  
**Status:** FULLY VERIFIED (PRAGMA Checks, Targeted SQLite Integrity Test Suite Executed, 56/56 Automated Tests Passing, 0 Typecheck Errors, All 4 D1 Migrations Applied)

---

## 1. Executive Summary

This report delivers the final integrity and security review of the **Milestone 6 Phase B** database architecture for the **Communication & Collaboration** module.

The audit verified:
1. **Tenant Integrity:** Complete inspection of all six communication table schemas, foreign key definitions, and identification of cross-tenant foreign key limitations inherent to single-column SQLite relational models.
2. **Direct Conversation Uniqueness:** Verification of canonical participant ordering ($\min(u_1, u_2)$, $\max(u_1, u_2)$), proof that duplicate 1-on-1 conversations are rejected at the SQLite engine level, verification of cross-tenant coexistence, and validation of SQLite `NULL` behavior ensuring group and team channels are unhindered.
3. **Database Integrity & Lifecycle Rules:** Direct SQLite PRAGMA inspection and automated behavioral test runs verifying cascading deletes (`ON DELETE CASCADE`), nullification (`ON DELETE SET NULL`), soft-deletion mechanics (`deleted_at`), reaction uniqueness, and attachment metadata bindings.
4. **Regression Verification:** Zero regression across the entire codebase—all 56 existing automated tests pass, monorepo typecheck reports 0 errors, and the local Cloudflare D1 migration journal is fully up to date.

---

## 2. Tenant Integrity & Cross-Tenant Foreign Key Analysis

### 2.1 Multi-Tenant Schema Invariants
All six communication tables contain a mandatory `tenant_id TEXT NOT NULL` column with a foreign key referencing `tenants(id) ON DELETE CASCADE` and a dedicated index `tenant_id`:
- `conversations`
- `conversation_members`
- `messages`
- `message_reactions`
- `attachments`
- `notifications`

### 2.2 Foreign Key Existence vs. Tenant Ownership Audit
In SQLite (and relational databases generally without composite primary keys on all tables), a single-column foreign key validates only that the referenced record **exists** in the target table; it does not validate that the referenced record shares the **same `tenant_id`**.

The table below documents the exact behavior of every relationship:

| Child Table & Column | Referenced Table & Column | What the DB Foreign Key Validates | What the DB Foreign Key CANNOT Validate | Enforcement Layer |
|---|---|---|---|---|
| `conversations.tenant_id` | `tenants(id)` | Validates tenant exists globally | N/A | Database (`CASCADE`) |
| `conversations.project_id` | `projects(id)` | Validates project exists globally | Does NOT validate `projects.tenant_id == conversations.tenant_id` | **Application Service Layer (Phase C)** |
| `conversations.created_by` | `users(id)` | Validates user exists globally | Does NOT validate user has active membership in `user_tenants` for `tenant_id` | **Application Service Layer (Phase C)** |
| `conversations.direct_user1_id` | `users(id)` | Validates user exists globally | Does NOT validate user belongs to `tenant_id` | **Application Service Layer (Phase C)** |
| `conversations.direct_user2_id` | `users(id)` | Validates user exists globally | Does NOT validate user belongs to `tenant_id` | **Application Service Layer (Phase C)** |
| `conversation_members.conversation_id` | `conversations(id)` | Validates conversation exists | Does NOT validate `conversations.tenant_id == conversation_members.tenant_id` | **Application Service Layer (Phase C)** |
| `conversation_members.user_id` | `users(id)` | Validates user exists globally | Does NOT validate user is in `user_tenants` for `tenant_id` | **Application Service Layer (Phase C)** |
| `messages.conversation_id` | `conversations(id)` | Validates conversation exists | Does NOT validate conversation belongs to `messages.tenant_id` | **Application Service Layer (Phase C)** |
| `messages.sender_user_id` | `users(id)` | Validates user exists globally | Does NOT validate user is a member of the conversation or tenant | **Application Service Layer (Phase C)** |
| `message_reactions.message_id` | `messages(id)` | Validates message exists | Does NOT validate message belongs to reaction `tenant_id` | **Application Service Layer (Phase C)** |
| `message_reactions.user_id` | `users(id)` | Validates user exists globally | Does NOT validate user belongs to tenant | **Application Service Layer (Phase C)** |
| `attachments.message_id` | `messages(id)` | Validates message exists | Does NOT validate message belongs to attachment `tenant_id` | **Application Service Layer (Phase C)** |
| `attachments.uploaded_by` | `users(id)` | Validates user exists globally | Does NOT validate user belongs to tenant | **Application Service Layer (Phase C)** |
| `notifications.conversation_id` | `conversations(id)` | Validates conversation exists | Does NOT validate conversation belongs to notification `tenant_id` | **Application Service Layer (Phase C)** |
| `notifications.message_id` | `messages(id)` | Validates message exists | Does NOT validate message belongs to notification `tenant_id` | **Application Service Layer (Phase C)** |
| `notifications.recipient_user_id` | `users(id)` | Validates recipient exists | Does NOT validate recipient belongs to tenant | **Application Service Layer (Phase C)** |
| `notifications.actor_user_id` | `users(id)` | Validates actor exists | Does NOT validate actor belongs to tenant | **Application Service Layer (Phase C)** |

### 2.3 Empirical Verification of the DB Gap
To confirm this behavior, `scripts/test-phase-b-integrity.mjs` performed an empirical test:
1. Created Tenant A with Project A.
2. Created Tenant B.
3. Attempted to insert a conversation in Tenant B referencing Project A.
4. **Result:** SQLite accepted the row without constraint error because `project_id -> projects(id)` checks only the primary key `id`.
5. Created a conversation in Tenant B and inserted a `conversation_members` record for a user who had no association in `user_tenants` for Tenant B.
6. **Result:** SQLite accepted the membership because `user_id -> users(id)` only checks that the user exists globally.

### 2.4 Required Application-Layer Tenant Guards for Phase C
Because SQLite does not enforce cross-table composite tenant constraints across independent entities, the Phase C API services will strictly enforce:
1. **Tenant Context Assertion:** Every database query MUST filter by `eq(table.tenantId, tenantId)`.
2. **User Workspace Membership:** Prior to adding any user to a conversation or sending a message, the API must query `userTenants` to verify `user_id` is an `ACTIVE` member of `c.get('tenantId')`.
3. **Project Ownership Verification:** When creating a `'PROJECT'` conversation, the API must explicitly verify `project.tenantId === c.get('tenantId')`.
4. **Parent Entity Scoping:** When inserting messages, reactions, or attachments, the parent conversation or message MUST be looked up with both `id` AND `tenantId` (e.g. `WHERE id = ? AND tenant_id = ?`).

---

## 3. Direct Conversation Uniqueness & Canonical Ordering

### 3.1 Canonical Participant Ordering Algorithm
In a direct conversation between two users $u_A$ and $u_B$, concurrent creation by either party must map to the same row:
$$\text{direct\_user1\_id} = \min(u_A, u_B)$$
$$\text{direct\_user2\_id} = \max(u_A, u_B)$$
Where $\min$ and $\max$ represent standard lexicographical string comparison of the user UUIDs.

### 3.2 Database Enforcement via Composite Unique Index
In `packages/database/src/schema/conversations.ts` and `0003_communication.sql`:
```sql
CREATE UNIQUE INDEX `conversations_direct_canonical_idx` 
ON `conversations` (`tenant_id`, `direct_user1_id`, `direct_user2_id`);
```

### 3.3 Verified Test Results
Executed directly in `scripts/test-phase-b-integrity.mjs`:
1. **Duplicate Direct Conversation in Same Tenant:**
   - User 1 and User 2 canonical pair inserted into Tenant A.
   - Second insertion attempted with the same canonical pair in Tenant A.
   - **Result:** Fails immediately with `SQLITE_CONSTRAINT_UNIQUE` (`UNIQUE constraint failed: conversations.tenant_id, conversations.direct_user1_id, conversations.direct_user2_id`).
2. **Direct Conversation in Different Tenant:**
   - Same User 1 and User 2 canonical pair inserted into Tenant B.
   - **Result:** Succeeded. Demonstrates users can communicate across distinct workspaces where they are mutual members without cross-tenant collision.
3. **SQLite `NULL` Behavior on Unique Composite Index:**
   - Under SQL and SQLite semantics, `NULL` values are distinct (`NULL != NULL`).
   - Group, Channel, and Project conversations set `direct_user1_id = NULL` and `direct_user2_id = NULL`.
   - Verified: Multiple `'GROUP'` and `'CHANNEL'` conversations were inserted into the same tenant with `NULL` direct participant columns.
   - **Result:** All insertions succeeded without any unique constraint conflicts. Non-direct conversations are 100% unaffected by the direct conversation constraint.

---

## 4. Database Integrity Inspection & Lifecycle Audit

Direct inspection was performed against the local D1 SQLite file using `PRAGMA table_info`, `PRAGMA foreign_key_list`, `PRAGMA index_list`, and the behavioral test harness.

### 4.1 Schema Inventory & Exact Constraints

#### Table 1: `conversations`
- **Columns (14):** `id` (PK, text), `tenant_id` (text, notnull), `conversation_type` (text, notnull), `name` (text), `description` (text), `project_id` (text), `direct_user1_id` (text), `direct_user2_id` (text), `created_by` (text, notnull), `last_message_at` (integer), `last_message_preview` (text), `is_archived` (integer, default 0, notnull), `created_at` (integer, notnull), `updated_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `project_id` -> `projects(id)` ON DELETE CASCADE
  - `direct_user1_id` -> `users(id)` ON DELETE CASCADE
  - `direct_user2_id` -> `users(id)` ON DELETE CASCADE
  - `created_by` -> `users(id)` ON DELETE CASCADE
- **Indexes:**
  - `conversations_direct_canonical_idx` (UNIQUE) on `(tenant_id, direct_user1_id, direct_user2_id)`
  - `conversations_tenant_idx` on `(tenant_id)`
  - `conversations_type_idx` on `(tenant_id, conversation_type)`
  - `conversations_last_msg_idx` on `(tenant_id, last_message_at)`
  - `conversations_project_idx` on `(project_id)`

#### Table 2: `conversation_members`
- **Columns (9):** `id` (PK, text), `tenant_id` (text, notnull), `conversation_id` (text, notnull), `user_id` (text, notnull), `role` (text, default 'MEMBER', notnull), `last_read_at` (integer), `muted_at` (integer), `is_active` (integer, default 1, notnull), `joined_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `conversation_id` -> `conversations(id)` ON DELETE CASCADE
  - `user_id` -> `users(id)` ON DELETE CASCADE
- **Indexes:**
  - `conv_members_unique_idx` (UNIQUE) on `(tenant_id, conversation_id, user_id)`
  - `conv_members_tenant_idx` on `(tenant_id)`
  - `conv_members_conv_idx` on `(conversation_id)`
  - `conv_members_user_idx` on `(user_id)`

#### Table 3: `messages`
- **Columns (11):** `id` (PK, text), `tenant_id` (text, notnull), `conversation_id` (text, notnull), `sender_user_id` (text, notnull), `message_type` (text, default 'TEXT', notnull), `content` (text, notnull), `reply_to_message_id` (text), `edited_at` (integer), `deleted_at` (integer), `created_at` (integer, notnull), `updated_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `conversation_id` -> `conversations(id)` ON DELETE CASCADE
  - `sender_user_id` -> `users(id)` ON DELETE CASCADE
- **Indexes:**
  - `messages_conv_created_idx` on `(tenant_id, conversation_id, created_at)`
  - `messages_tenant_idx` on `(tenant_id)`
  - `messages_sender_idx` on `(sender_user_id)`
  - `messages_reply_idx` on `(reply_to_message_id)`

#### Table 4: `message_reactions`
- **Columns (6):** `id` (PK, text), `tenant_id` (text, notnull), `message_id` (text, notnull), `user_id` (text, notnull), `reaction` (text, notnull), `created_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `message_id` -> `messages(id)` ON DELETE CASCADE
  - `user_id` -> `users(id)` ON DELETE CASCADE
- **Indexes:**
  - `msg_reactions_unique_idx` (UNIQUE) on `(tenant_id, message_id, user_id, reaction)`
  - `msg_reactions_tenant_idx` on `(tenant_id)`
  - `msg_reactions_msg_idx` on `(message_id)`

#### Table 5: `attachments`
- **Columns (9):** `id` (PK, text), `tenant_id` (text, notnull), `message_id` (text, notnull), `uploaded_by` (text, notnull), `file_name` (text, notnull), `mime_type` (text, notnull), `file_size` (integer, notnull), `storage_key` (text, notnull), `created_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `message_id` -> `messages(id)` ON DELETE CASCADE
  - `uploaded_by` -> `users(id)` ON DELETE CASCADE
- **Indexes:**
  - `attachments_tenant_idx` on `(tenant_id)`
  - `attachments_msg_idx` on `(message_id)`

#### Table 6: `notifications`
- **Columns (11):** `id` (PK, text), `tenant_id` (text, notnull), `recipient_user_id` (text, notnull), `actor_user_id` (text), `type` (text, notnull), `conversation_id` (text), `message_id` (text), `title` (text, notnull), `body` (text, notnull), `is_read` (integer, default 0, notnull), `created_at` (integer, notnull).
- **Foreign Keys:**
  - `tenant_id` -> `tenants(id)` ON DELETE CASCADE
  - `recipient_user_id` -> `users(id)` ON DELETE CASCADE
  - `actor_user_id` -> `users(id)` ON DELETE SET NULL
  - `conversation_id` -> `conversations(id)` ON DELETE CASCADE
  - `message_id` -> `messages(id)` ON DELETE CASCADE
- **Indexes:**
  - `notifications_tenant_recipient_idx` on `(tenant_id, recipient_user_id, is_read, created_at)`
  - `notifications_conv_idx` on `(conversation_id)`

---

### 4.2 Verified Behavioral Invariants

1. **Cascading Deletion Across Tree:**
   - Deleting a conversation cleanly purged child `conversation_members`, `messages`, `message_reactions`, and `notifications` (verified count = 0).
2. **Actor Deletion Nullification (`ON DELETE SET NULL`):**
   - Deleting an actor user set `notifications.actor_user_id = NULL`, successfully preserving recipient notification history and preventing audit loss.
3. **Message Soft-Delete:**
   - Setting `messages.deleted_at = timestamp` retains the message record and original text in the database. In Phase C, the API layer will return sanitized placeholder content (`"This message was deleted"`) while retaining the audit trail.
4. **Reaction Idempotency:**
   - The unique composite index `msg_reactions_unique_idx` was verified to block identical reactions from the same user on the same message, while allowing the same user to add distinct emojis (e.g. `👍` and `❤️`).
5. **Thread Replying:**
   - `reply_to_message_id` correctly models thread hierarchy. Because messages are soft-deleted, thread trees remain intact.

---

## 5. Regression Verification Results

### 5.1 Monorepo TypeScript Compilation
Executed `pnpm typecheck`:
- `packages/database typecheck`: **Done (0 errors)**
- `apps/web typecheck`: **Done (0 errors)**
- `apps/api typecheck`: **Done (0 errors)**

### 5.2 Automated Vitest Test Suite
Executed `pnpm test`:
- **Test Files Passed:** 9 of 9 (100%)
  - `tests/departments-response.test.ts` (4 tests)
  - `tests/tasks.test.ts` (5 tests)
  - `tests/auth.test.ts` (10 tests)
  - `tests/security-hardening.test.ts` (11 tests)
  - `tests/projects.test.ts` (6 tests)
  - `tests/employees.test.ts` (7 tests)
  - `tests/departments.test.ts` (6 tests)
  - `tests/health.test.ts` (2 tests)
  - `tests/tenant.test.ts` (5 tests)
- **Total Tests Passed:** 56 of 56 (100%)

### 5.3 Local D1 Migration Status
Verified via Wrangler CLI (`wrangler d1 migrations list DB --local`) and direct inspection of `d1_migrations` table:
- `0000_purple_christian_walker.sql` (Applied)
- `0001_absurd_tag.sql` (Applied)
- `0002_fantastic_logan.sql` (Applied)
- `0003_communication.sql` (Applied)
- **Wrangler Status:** `✅ No migrations to apply!` (Local schema fully up to date).

---

## 6. Phase C Implementation Requirements & Recommendations

Based on the verified findings of this audit, the Phase C API implementation must adhere to the following rules:

1. **Enforce Canonical Participant Ordering in Direct Chat Factory:**
   ```typescript
   const [directUser1Id, directUser2Id] = [userA, userB].sort();
   ```
2. **Multi-Tenant User Verification:**
   Before creating conversations, adding members, or sending messages, verify that the participant has an active record in `user_tenants` for the target `tenantId`.
3. **Cross-Tenant Project Linkage Guard:**
   Before linking a conversation to a `projectId`, verify `project.tenantId === currentTenantId`.
4. **Soft-Delete Masking:**
   On `GET /api/v1/messages`, if `deletedAt IS NOT NULL`, replace `content` with `"This message was deleted"` and omit reactions/attachments from the client response unless requested by an authorized workspace admin.
5. **Delta Polling Optimization:**
   The `messages_conv_created_idx` (`tenant_id`, `conversation_id`, `created_at`) must be leveraged for delta polling via `GET /api/v1/messages?conversationId=...&since=<lastMessageTimestamp>` to avoid high-frequency full-table scans.

---

## 7. Audit Conclusion

Milestone 6 Phase B database schemas, migrations, indexes, constraints, and relational mappings are completely verified, robust, and free of regressions.

No API endpoints or frontend code have been implemented.

Ready for user review and authorization to proceed to **Phase C (Backend API Implementation)**.
