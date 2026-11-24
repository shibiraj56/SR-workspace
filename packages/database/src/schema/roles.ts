import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { users } from './users';

export const roles = sqliteTable(
  'roles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    roleType: text('role_type', { enum: ['SYSTEM', 'CUSTOM'] })
      .notNull()
      .default('CUSTOM'),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('roles_tenant_idx').on(table.tenantId),
    codeIdx: index('roles_code_idx').on(table.code),
  })
);

export const permissions = sqliteTable(
  'permissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    module: text('module').notNull(),
    action: text('action').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    codeIdx: index('permissions_code_idx').on(table.code),
    moduleIdx: index('permissions_module_idx').on(table.module),
  })
);

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    rolePermissionIdx: index('role_permissions_role_permission_idx').on(table.roleId, table.permissionId),
  })
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    assignedAt: integer('assigned_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userRoleIdx: index('user_roles_user_role_tenant_idx').on(table.userId, table.roleId, table.tenantId),
    tenantIdx: index('user_roles_tenant_idx').on(table.tenantId),
  })
);
