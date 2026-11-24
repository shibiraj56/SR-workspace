import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { organisations } from './organisations';
import { users } from './users';

export const departments = sqliteTable(
  'departments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    organisationId: text('organisation_id')
      .references(() => organisations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    departmentHeadId: text('department_head_id'),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .notNull()
      .default('ACTIVE'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('departments_tenant_idx').on(table.tenantId),
    tenantCodeUnique: uniqueIndex('departments_tenant_code_unique').on(table.tenantId, table.code),
    statusIdx: index('departments_status_idx').on(table.status),
  })
);
