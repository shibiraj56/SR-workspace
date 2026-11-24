import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { users } from './users';
import { conversations, messages } from './conversations';

export const NOTIFICATION_TYPE = [
  'NEW_MESSAGE',
  'GROUP_INVITATION',
  'CHANNEL_INVITATION',
  'MENTION',
  'PROJECT_MESSAGE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

/**
 * Notifications Table
 * Real-time and persistent notification delivery for workspace communication events.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type', { enum: NOTIFICATION_TYPE }).notNull(),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    isRead: integer('is_read', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantRecipientIdx: index('notifications_tenant_recipient_idx').on(
      table.tenantId,
      table.recipientUserId,
      table.isRead,
      table.createdAt
    ),
    convIdx: index('notifications_conv_idx').on(table.conversationId),
  })
);
