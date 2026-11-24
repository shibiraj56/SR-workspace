import type { MiddlewareHandler, Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { tenants, userTenants } from '@sr-workspace/database';
import { getDb } from '../lib/db';
import { apiError } from '../lib/response';
import type { HonoEnv, ValidatedTenant } from '../types/context';

export function tenantMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'Authentication required to access tenant workspace.', 401);
    }

    const db = getDb(c);

    // Resolve target tenant ID from header, query, or user's default tenant
    const headerTenantId = c.req.header('x-tenant-id');
    const queryTenantId = c.req.query('tenantId');
    const candidateTenantId = headerTenantId || queryTenantId || user.tenantId;

    if (!candidateTenantId) {
      // If user has only one active tenant, resolve it automatically
      const memberships = await db.query.userTenants.findMany({
        where: and(eq(userTenants.userId, user.id), eq(userTenants.status, 'ACTIVE')),
        with: { tenant: true },
      });

      if (memberships.length === 0) {
        return apiError(c, 'NO_TENANT_MEMBERSHIP', 'User has no active tenant workspaces.', 403);
      }

      const defaultMembership = memberships.find((m) => m.isDefault) || memberships[0];
      const selectedTenant = defaultMembership.tenant;

      if (selectedTenant.status !== 'ACTIVE') {
        return apiError(c, 'TENANT_INACTIVE', 'Tenant workspace is suspended or inactive.', 403);
      }

      c.set('tenantId', selectedTenant.id);
      c.set('tenant', {
        id: selectedTenant.id,
        name: selectedTenant.name,
        slug: selectedTenant.slug,
        status: selectedTenant.status,
        plan: selectedTenant.plan,
      });

      await next();
      return;
    }

    // Verify tenant exists and is ACTIVE
    const tenantRecord = await db.query.tenants.findFirst({
      where: eq(tenants.id, candidateTenantId),
    });

    if (!tenantRecord) {
      return apiError(c, 'TENANT_NOT_FOUND', 'Requested tenant workspace does not exist.', 404);
    }

    if (tenantRecord.status !== 'ACTIVE') {
      return apiError(c, 'TENANT_INACTIVE', `Tenant workspace is ${tenantRecord.status.toLowerCase()}. Access denied.`, 403);
    }

    // Super Administrator override check (SUPER_ADMIN role may access any tenant if needed)
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');

    if (!isSuperAdmin) {
      // Validate user's specific membership in candidate tenant
      const membership = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, user.id),
          eq(userTenants.tenantId, candidateTenantId),
          eq(userTenants.status, 'ACTIVE')
        ),
      });

      if (!membership) {
        return apiError(
          c,
          'TENANT_ACCESS_DENIED',
          'Cross-tenant access rejected: You are not an active member of this tenant workspace.',
          403
        );
      }
    }

    const validatedTenant: ValidatedTenant = {
      id: tenantRecord.id,
      name: tenantRecord.name,
      slug: tenantRecord.slug,
      status: tenantRecord.status,
      plan: tenantRecord.plan,
    };

    c.set('tenantId', validatedTenant.id);
    c.set('tenant', validatedTenant);

    await next();
  };
}

/**
 * Helper to ensure a route handler has an explicitly validated tenant scope.
 */
export function getTenantScope(c: Context<HonoEnv>): { tenantId: string; tenant: ValidatedTenant } {
  const tenantId = c.get('tenantId');
  const tenant = c.get('tenant');

  if (!tenantId || !tenant) {
    throw new Error('Tenant context has not been validated. Ensure tenantMiddleware is applied.');
  }

  return { tenantId, tenant };
}
