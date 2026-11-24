import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable(
  'tenants',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    customDomain: text('custom_domain'),
    status: text('status', {
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'],
    })
      .notNull()
      .default('ACTIVE'),
    plan: text('plan', {
      enum: ['TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
    })
      .notNull()
      .default('TRIAL'),
    logoUrl: text('logo_url'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    slugIdx: index('tenants_slug_idx').on(table.slug),
    statusIdx: index('tenants_status_idx').on(table.status),
  })
);

export const tenantSettings = sqliteTable(
  'tenant_settings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    timezone: text('timezone').notNull().default('UTC'),
    dateFormat: text('date_format').notNull().default('YYYY-MM-DD'),
    currency: text('currency').notNull().default('USD'),
    fiscalYearStart: integer('fiscal_year_start').notNull().default(1),
    themeConfig: text('theme_config', { mode: 'json' }),
    securityPolicy: text('security_policy', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('tenant_settings_tenant_idx').on(table.tenantId),
  })
);
