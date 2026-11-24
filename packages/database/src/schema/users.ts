import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';

export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    status: text('status', {
      enum: ['ACTIVE', 'INACTIVE', 'INVITED', 'LOCKED'],
    })
      .notNull()
      .default('ACTIVE'),
    emailVerified: integer('email_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    statusIdx: index('users_status_idx').on(table.status),
  })
);

export const userTenants = sqliteTable(
  'user_tenants',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .notNull()
      .default('ACTIVE'),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userTenantIdx: index('user_tenants_user_tenant_idx').on(table.userId, table.tenantId),
    tenantIdx: index('user_tenants_tenant_idx').on(table.tenantId),
  })
);

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tokenHashIdx: index('refresh_tokens_token_hash_idx').on(table.tokenHash),
    userIdx: index('refresh_tokens_user_idx').on(table.userId),
  })
);
