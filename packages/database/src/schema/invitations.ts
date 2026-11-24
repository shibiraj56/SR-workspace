import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { employees } from './employees';
import { roles } from './roles';
import { users } from './users';

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    status: text('status', {
      enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'],
    })
      .notNull()
      .default('PENDING'),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('invitations_tenant_idx').on(table.tenantId),
    employeeIdx: index('invitations_employee_idx').on(table.employeeId),
    emailIdx: index('invitations_email_idx').on(table.email),
    statusIdx: index('invitations_status_idx').on(table.status),
    tokenHashUnique: uniqueIndex('invitations_token_hash_uidx').on(table.tokenHash),
    employeePendingUnique: uniqueIndex('invitations_employee_pending_uidx')
      .on(table.employeeId)
      .where(sql`${table.status} = 'PENDING'`),
  })
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
