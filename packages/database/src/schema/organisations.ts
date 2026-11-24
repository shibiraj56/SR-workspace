import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';

export const organisations = sqliteTable(
  'organisations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    legalName: text('legal_name'),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .notNull()
      .default('ACTIVE'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('organisations_tenant_idx').on(table.tenantId),
    tenantCodeIdx: index('organisations_tenant_code_idx').on(table.tenantId, table.code),
  })
);

export const branches = sqliteTable(
  'branches',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    organisationId: text('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    email: text('email'),
    phone: text('phone'),
    isHeadquarters: integer('is_headquarters', { mode: 'boolean' })
      .notNull()
      .default(false),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .notNull()
      .default('ACTIVE'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('branches_tenant_idx').on(table.tenantId),
    orgIdx: index('branches_organisation_idx').on(table.organisationId),
    tenantCodeIdx: index('branches_tenant_code_idx').on(table.tenantId, table.code),
  })
);
