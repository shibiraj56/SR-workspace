import { Hono } from 'hono';
import { NotificationsService } from './notifications.service';
import { listNotificationsQuerySchema } from './communication.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const notificationsController = new Hono<HonoEnv>();

notificationsController.use('*', authMiddleware());
notificationsController.use('*', tenantMiddleware());

/**
 * GET /api/v1/notifications
 * List notifications for current user in active tenant.
 */
notificationsController.get('/', requirePermission('communication:read'), async (c) => {
  const query = c.req.query();
  const validation = listNotificationsQuerySchema.safeParse(query);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid query parameters.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await NotificationsService.listNotifications(
      db,
      tenantId,
      user?.id || '',
      validation.data
    );
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count.
 */
notificationsController.get('/unread-count', requirePermission('communication:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await NotificationsService.getUnreadCount(db, tenantId, user?.id || '');
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark notification as read.
 */
notificationsController.patch('/:id/read', requirePermission('communication:read'), async (c) => {
  const notificationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await NotificationsService.markAsRead(
      db,
      tenantId,
      user?.id || '',
      notificationId
    );
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for current user.
 */
notificationsController.post('/read-all', requirePermission('communication:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await NotificationsService.markAllAsRead(db, tenantId, user?.id || '');
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification.
 */
notificationsController.delete('/:id', requirePermission('communication:read'), async (c) => {
  const notificationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await NotificationsService.deleteNotification(
      db,
      tenantId,
      user?.id || '',
      notificationId
    );
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
