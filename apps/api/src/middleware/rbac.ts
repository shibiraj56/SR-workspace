import type { MiddlewareHandler } from 'hono';
import { apiError } from '../lib/response';
import type { HonoEnv } from '../types/context';

/**
 * Normalizes a permission string so both 'employees:read' and 'employees.read' match.
 */
function normalizePermission(perm: string): string {
  return perm.replace('.', ':');
}

/**
 * Middleware to enforce RBAC permissions on endpoints.
 * SUPER_ADMIN and TENANT_ADMIN roles have wildcard administrative access.
 */
export function requirePermission(
  requiredPermission: string | string[]
): MiddlewareHandler<HonoEnv> {
  const permissionsList = (
    Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]
  ).map(normalizePermission);

  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'Authentication required.', 401);
    }

    // Administrative override
    if (user.roles?.includes('SUPER_ADMIN') || user.roles?.includes('TENANT_ADMIN')) {
      await next();
      return;
    }

    const userPermissions = (user.permissions || []).map(normalizePermission);

    // If user has no explicit permissions array, check if user's role grants it
    // Check if user has ANY of the required permissions
    const hasPermission = permissionsList.some((required) =>
      userPermissions.includes(required)
    );

    // If role is EMPLOYEE or VIEWER and checking read permission, grant read access
    const isReadPermission = permissionsList.every((p) => p.endsWith(':read'));
    const isStandardRole = user.roles?.some((r) => ['EMPLOYEE', 'VIEWER', 'BRANCH_MANAGER', 'ORG_ADMIN'].includes(r));

    if (hasPermission || (isReadPermission && isStandardRole)) {
      await next();
      return;
    }

    // Role-based write access for ORG_ADMIN, BRANCH_MANAGER, and EMPLOYEE operations
    const isWriteAllowed =
      (user.roles?.includes('ORG_ADMIN') && !permissionsList.some((p) => p.endsWith(':delete'))) ||
      (user.roles?.includes('BRANCH_MANAGER') && permissionsList.some((p) => (p.startsWith('employees:') || p.startsWith('tasks:') || p.startsWith('communication:') || p.startsWith('hr:') || p.startsWith('attendance:') || p.startsWith('leave:')) && !p.endsWith(':delete') && p !== 'communication:create_channel' && p !== 'communication:manage_members')) ||
      (user.roles?.some((r) => ['EMPLOYEE', 'BRANCH_MANAGER', 'ORG_ADMIN'].includes(r)) && permissionsList.some((p) => (
        p === 'tasks:create' ||
        p === 'tasks:update' ||
        p === 'tasks:manage_comments' ||
        p === 'communication:send' ||
        p === 'communication:create_group' ||
        p === 'attendance:punch' ||
        p === 'leave:apply' ||
        p === 'performance:self' ||
        p === 'attendance:regularize'
      )));

    if (isWriteAllowed) {
      await next();
      return;
    }

    return apiError(
      c,
      'RBAC_FORBIDDEN',
      `Access denied: You do not have the required permissions (${permissionsList.join(', ')}).`,
      403
    );
  };
}
