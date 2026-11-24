import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { userTenants } from '@sr-workspace/database';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { getDb } from '../../lib/db';
import { apiSuccess } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const usersController = new Hono<HonoEnv>();

// Require authentication and active tenant context for all user routes
usersController.use('*', authMiddleware(), tenantMiddleware());

/**
 * GET /api/v1/users
 * Lists active users within the validated tenant workspace.
 */
usersController.get('/', async (c) => {
  const { tenantId } = getTenantScope(c);
  const db = getDb(c);

  const tenantUsers = await db.query.userTenants.findMany({
    where: eq(userTenants.tenantId, tenantId),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });

  const formattedUsers = tenantUsers.map((tu) => ({
    ...tu.user,
    isDefaultTenant: tu.isDefault,
    membershipStatus: tu.status,
    joinedAt: tu.joinedAt,
  }));

  return apiSuccess(c, { users: formattedUsers }, 200);
});
