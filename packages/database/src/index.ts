import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export * from './schema';

export type AppDatabase = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// Inferred TypeScript Types
export type Tenant = typeof schema.tenants.$inferSelect;
export type NewTenant = typeof schema.tenants.$inferInsert;

export type TenantSetting = typeof schema.tenantSettings.$inferSelect;
export type NewTenantSetting = typeof schema.tenantSettings.$inferInsert;

export type Organisation = typeof schema.organisations.$inferSelect;
export type NewOrganisation = typeof schema.organisations.$inferInsert;

export type Branch = typeof schema.branches.$inferSelect;
export type NewBranch = typeof schema.branches.$inferInsert;

export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;

export type UserTenant = typeof schema.userTenants.$inferSelect;
export type NewUserTenant = typeof schema.userTenants.$inferInsert;

export type RefreshToken = typeof schema.refreshTokens.$inferSelect;
export type NewRefreshToken = typeof schema.refreshTokens.$inferInsert;

export type Role = typeof schema.roles.$inferSelect;
export type NewRole = typeof schema.roles.$inferInsert;

export type Permission = typeof schema.permissions.$inferSelect;
export type NewPermission = typeof schema.permissions.$inferInsert;

export type RolePermission = typeof schema.rolePermissions.$inferSelect;
export type NewRolePermission = typeof schema.rolePermissions.$inferInsert;

export type UserRole = typeof schema.userRoles.$inferSelect;
export type NewUserRole = typeof schema.userRoles.$inferInsert;

export type AuditLog = typeof schema.auditLogs.$inferSelect;
export type NewAuditLog = typeof schema.auditLogs.$inferInsert;
