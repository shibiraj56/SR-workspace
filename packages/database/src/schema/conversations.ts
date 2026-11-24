import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { users } from './users';
import { projects } from './projects';

export const CONVERSATION_TYPE = ['DIRECT', 'GROUP', 'CHANNEL', 'PROJECT'] as const;
export type ConversationType = (typeof CONVERSATION_TYPE)[number];

export const CONVERSATION_MEMBER_ROLE = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type ConversationMemberRole = (typeof CONVERSATION_MEMBER_ROLE)[number];

export const MESSAGE_TYPE = ['TEXT', 'SYSTEM', 'FILE'] as const;
export type MessageType = (typeof MESSAGE_TYPE)[number];

/**
 * Conversations Table
 * Unified container for 1:1 direct chats, group chats, channels, and project discussions.
 * Direct chats enforce uniqueness through canonical participant ordering (directUser1Id < directUser2Id).
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationType: text('conversation_type', { enum: CONVERSATION_TYPE }).notNull(),
    name: text('name'),
    description: text('description'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    directUser1Id: text('direct_user1_id').references(() => users.id, { onDelete: 'cascade' }),
    directUser2Id: text('direct_user2_id').references(() => users.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
    lastMessagePreview: text('last_message_preview'),
    isArchived: integer('is_archived', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('conversations_tenant_idx').on(table.tenantId),
    typeIdx: index('conversations_type_idx').on(table.tenantId, table.conversationType),
    lastMessageIdx: index('conversations_last_msg_idx').on(table.tenantId, table.lastMessageAt),
    projectIdx: index('conversations_project_idx').on(table.projectId),
    directCanonicalUniqueIdx: uniqueIndex('conversations_direct_canonical_idx').on(
      table.tenantId,
      table.directUser1Id,
      table.directUser2Id
    ),
  })
);

/**
 * Conversation Members Table
 * Membership tracking, roles, and read position indicators.
 */
export const conversationMembers = sqliteTable(
  'conversation_members',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: CONVERSATION_MEMBER_ROLE })
      .notNull()
      .default('MEMBER'),
    lastReadAt: integer('last_read_at', { mode: 'timestamp_ms' }),
    mutedAt: integer('muted_at', { mode: 'timestamp_ms' }),
    isActive: integer('is_active', { mode: 'boolean' })
      .notNull()
      .default(true),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('conv_members_tenant_idx').on(table.tenantId),
    convIdx: index('conv_members_conv_idx').on(table.conversationId),
    userIdx: index('conv_members_user_idx').on(table.userId),
    uniqueMemberIdx: uniqueIndex('conv_members_unique_idx').on(
      table.tenantId,
      table.conversationId,
      table.userId
    ),
  })
);

/**
 * Messages Table
 * Persistent message storage supporting text, replies, edits, and soft deletions.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: text('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageType: text('message_type', { enum: MESSAGE_TYPE })
      .notNull()
      .default('TEXT'),
    content: text('content').notNull(),
    replyToMessageId: text('reply_to_message_id'),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('messages_tenant_idx').on(table.tenantId),
    convCreatedIdx: index('messages_conv_created_idx').on(
      table.tenantId,
      table.conversationId,
      table.createdAt
    ),
    senderIdx: index('messages_sender_idx').on(table.senderUserId),
    replyIdx: index('messages_reply_idx').on(table.replyToMessageId),
  })
);

/**
 * Message Reactions Table
 * Emoji reactions on messages with duplicate prevention.
 */
export const messageReactions = sqliteTable(
  'message_reactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('msg_reactions_tenant_idx').on(table.tenantId),
    msgIdx: index('msg_reactions_msg_idx').on(table.messageId),
    uniqueReactionIdx: uniqueIndex('msg_reactions_unique_idx').on(
      table.tenantId,
      table.messageId,
      table.userId,
      table.reaction
    ),
  })
);

/**
 * Attachments Table
 * File attachment metadata reference for message attachments.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('attachments_tenant_idx').on(table.tenantId),
    msgIdx: index('attachments_msg_idx').on(table.messageId),
  })
);
