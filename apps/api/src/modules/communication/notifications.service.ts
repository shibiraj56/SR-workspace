import { eq, and, desc, count } from 'drizzle-orm';
import {
  type AppDatabase,
  notifications,
  users,
  conversations,
} from '@sr-workspace/database';
import type { ListNotificationsQuery } from './communication.schemas';

export class NotificationsService {
  /**
   * List notifications for the authenticated user within their active tenant.
   */
  static async listNotifications(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    query: ListNotificationsQuery
  ) {
    const conditions = [
      eq(notifications.tenantId, tenantId),
      eq(notifications.recipientUserId, userId),
    ];

    if (query.isRead !== undefined) {
      conditions.push(eq(notifications.isRead, query.isRead));
    }

    const whereClause = and(...conditions);

    const totalResult = await db.select({ count: count() }).from(notifications).where(whereClause);
    const total = totalResult[0]?.count || 0;

    const offset = (query.page - 1) * query.limit;

    const rows = await db.query.notifications.findMany({
      where: whereClause,
      orderBy: [desc(notifications.createdAt)],
      limit: query.limit,
      offset,
      with: {
        actor: true,
        conversation: true,
      },
    });

    const items = rows.map((n) => ({
      id: n.id,
      tenantId: n.tenantId,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      conversationId: n.conversationId,
      messageId: n.messageId,
      actor: n.actor
        ? {
            id: n.actor.id,
            firstName: n.actor.firstName,
            lastName: n.actor.lastName,
            email: n.actor.email,
            avatarUrl: n.actor.avatarUrl,
          }
        : null,
      createdAt: n.createdAt,
    }));

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Get unread notification count for badge display.
   */
  static async getUnreadCount(db: AppDatabase, tenantId: string, userId: string) {
    const result = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.recipientUserId, userId),
          eq(notifications.isRead, false)
        )
      );

    return { unreadCount: result[0]?.count || 0 };
  }

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(db: AppDatabase, tenantId: string, userId: string, notificationId: string) {
    const notif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.id, notificationId),
        eq(notifications.tenantId, tenantId),
        eq(notifications.recipientUserId, userId)
      ),
    });

    if (!notif) {
      throw { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.', status: 404 };
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));

    return {
      id: notif.id,
      isRead: true,
    };
  }

  /**
   * Mark all unread notifications as read for current user.
   */
  static async markAllAsRead(db: AppDatabase, tenantId: string, userId: string) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.recipientUserId, userId),
          eq(notifications.isRead, false)
        )
      );

    return { success: true };
  }

  /**
   * Delete a notification.
   */
  static async deleteNotification(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    notificationId: string
  ) {
    const notif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.id, notificationId),
        eq(notifications.tenantId, tenantId),
        eq(notifications.recipientUserId, userId)
      ),
    });

    if (!notif) {
      throw { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.', status: 404 };
    }

    await db.delete(notifications).where(eq(notifications.id, notificationId));

    return { success: true };
  }
}
