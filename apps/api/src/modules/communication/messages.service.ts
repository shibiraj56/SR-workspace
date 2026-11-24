import { eq, and, or, like, desc, asc, count, sql, inArray } from 'drizzle-orm';
import {
  type AppDatabase,
  conversations,
  conversationMembers,
  messages,
  messageReactions,
  notifications,
  users,
  auditLogs,
} from '@sr-workspace/database';
import type {
  CreateMessageInput,
  UpdateMessageInput,
  ListMessagesQuery,
  SearchMessagesQuery,
} from './communication.schemas';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

interface CursorData {
  t: number;
  id: string;
}

function encodeCursor(createdAt: Date | number, id: string): string {
  const t = typeof createdAt === 'number' ? createdAt : createdAt.getTime();
  return Buffer.from(JSON.stringify({ t, id })).toString('base64');
}

function decodeCursor(cursorStr: string): CursorData | null {
  try {
    // Try base64 json format
    const jsonStr = Buffer.from(cursorStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.t === 'number' && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    // Try timestamp_id format
    const parts = cursorStr.split('_');
    if (parts.length === 2) {
      const t = parseInt(parts[0], 10);
      if (!isNaN(t)) {
        return { t, id: parts[1] };
      }
    }
  }
  return null;
}

export class MessagesService {
  /**
   * Helper to write audit logs.
   */
  private static async audit(
    db: AppDatabase,
    tenantId: string,
    userId: string | undefined,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityId: string,
    changes: Record<string, any>,
    meta?: RequestMeta
  ) {
    if (!userId) return;
    try {
      await db.insert(auditLogs).values({
        tenantId,
        userId,
        action,
        entityType: 'message',
        entityId,
        changes: JSON.stringify(changes),
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    } catch {
      // non-critical audit logging failure
    }
  }

  /**
   * List messages in a conversation with composite cursor pagination (createdAt + id).
   */
  static async listMessages(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    query: ListMessagesQuery
  ) {
    // 1. Verify conversation exists and user has membership
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)),
      with: {
        members: {
          where: eq(conversationMembers.isActive, true),
        },
      },
    });

    if (!conv) {
      throw { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.', status: 404 };
    }

    const isMember = conv.members.some((m) => m.userId === userId);
    if (!isMember && conv.conversationType !== 'CHANNEL') {
      throw {
        code: 'CONVERSATION_ACCESS_DENIED',
        message: 'You are not an active member of this conversation.',
        status: 403,
      };
    }

    // 2. Cursor pagination
    const baseConditions = [
      eq(messages.tenantId, tenantId),
      eq(messages.conversationId, conversationId),
    ];

    const isSinceQuery = Boolean(query.since);
    let cursor = query.cursor ? decodeCursor(query.cursor) : null;

    if (!cursor && query.before) {
      cursor = decodeCursor(query.before);
    } else if (!cursor && query.since) {
      cursor = decodeCursor(query.since);
    }

    if (cursor) {
      if (isSinceQuery) {
        // Delta forward query (created after cursor)
        baseConditions.push(
          or(
            sql`${messages.createdAt} > ${cursor.t}`,
            and(sql`${messages.createdAt} = ${cursor.t}`, sql`${messages.id} > ${cursor.id}`)
          )!
        );
      } else {
        // History backward query (created before cursor)
        baseConditions.push(
          or(
            sql`${messages.createdAt} < ${cursor.t}`,
            and(sql`${messages.createdAt} = ${cursor.t}`, sql`${messages.id} < ${cursor.id}`)
          )!
        );
      }
    }

    const limit = query.limit;

    // Execute query with limit + 1 to check if there are more
    const rows = await db.query.messages.findMany({
      where: and(...baseConditions),
      orderBy: isSinceQuery
        ? [asc(messages.createdAt), asc(messages.id)]
        : [desc(messages.createdAt), desc(messages.id)],
      limit: limit + 1,
      with: {
        sender: true,
        replyTo: {
          with: {
            sender: true,
          },
        },
        reactions: {
          with: {
            user: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const pagedRows = hasMore ? rows.slice(0, limit) : rows;

    // For backwards history query, reverse so frontend renders in chronological ASC order
    const orderedRows = isSinceQuery ? pagedRows : pagedRows.reverse();

    // Format messages and mask soft-deleted
    const items = orderedRows.map((msg) => {
      const isDeleted = msg.deletedAt !== null;

      // Group reactions by emoji
      const reactionMap = new Map<string, { reaction: string; count: number; users: any[]; hasReacted: boolean }>();
      for (const r of msg.reactions) {
        if (!reactionMap.has(r.reaction)) {
          reactionMap.set(r.reaction, {
            reaction: r.reaction,
            count: 0,
            users: [],
            hasReacted: false,
          });
        }
        const grp = reactionMap.get(r.reaction)!;
        grp.count += 1;
        grp.users.push({
          id: r.user.id,
          name: `${r.user.firstName} ${r.user.lastName}`,
        });
        if (r.userId === userId) {
          grp.hasReacted = true;
        }
      }

      return {
        id: msg.id,
        tenantId: msg.tenantId,
        conversationId: msg.conversationId,
        senderUserId: msg.senderUserId,
        sender: {
          id: msg.sender.id,
          firstName: msg.sender.firstName,
          lastName: msg.sender.lastName,
          email: msg.sender.email,
          avatarUrl: msg.sender.avatarUrl,
        },
        messageType: msg.messageType,
        content: isDeleted ? '[This message was deleted]' : msg.content,
        replyToMessageId: msg.replyToMessageId,
        replyTo: msg.replyTo
          ? {
              id: msg.replyTo.id,
              content: msg.replyTo.deletedAt ? '[This message was deleted]' : msg.replyTo.content,
              senderName: `${msg.replyTo.sender.firstName} ${msg.replyTo.sender.lastName}`,
            }
          : null,
        isEdited: msg.editedAt !== null,
        editedAt: msg.editedAt,
        isDeleted,
        deletedAt: msg.deletedAt,
        reactions: Array.from(reactionMap.values()),
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      };
    });

    // Compute next and previous cursors
    let nextCursor: string | null = null;
    let prevCursor: string | null = null;

    if (orderedRows.length > 0) {
      const oldestMsg = orderedRows[0];
      const newestMsg = orderedRows[orderedRows.length - 1];
      prevCursor = encodeCursor(oldestMsg.createdAt, oldestMsg.id);
      nextCursor = encodeCursor(newestMsg.createdAt, newestMsg.id);
    }

    return {
      items,
      pagination: {
        hasMore,
        limit,
        prevCursor,
        nextCursor,
      },
    };
  }

  /**
   * Post a new message to a conversation.
   */
  static async createMessage(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    input: CreateMessageInput,
    meta?: RequestMeta
  ) {
    // 1. Verify conversation exists and user is active member
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)),
      with: {
        members: {
          where: eq(conversationMembers.isActive, true),
          with: {
            user: true,
          },
        },
      },
    });

    if (!conv) {
      throw { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.', status: 404 };
    }

    const currentMember = conv.members.find((m) => m.userId === userId);
    if (!currentMember && conv.conversationType !== 'CHANNEL') {
      throw {
        code: 'NOT_CONVERSATION_MEMBER',
        message: 'You must be an active member to send messages in this conversation.',
        status: 403,
      };
    }

    // 2. Validate reply target if specified
    if (input.replyToMessageId) {
      const replyTarget = await db.query.messages.findFirst({
        where: and(
          eq(messages.id, input.replyToMessageId),
          eq(messages.tenantId, tenantId),
          eq(messages.conversationId, conversationId)
        ),
      });

      if (!replyTarget) {
        throw {
          code: 'INVALID_REPLY_TARGET',
          message: 'The message you are replying to was not found in this conversation.',
          status: 400,
        };
      }
    }

    const now = new Date();
    const messageId = crypto.randomUUID();

    // 3. Insert message
    await db.insert(messages).values({
      id: messageId,
      tenantId,
      conversationId,
      senderUserId: userId,
      messageType: input.messageType || 'TEXT',
      content: input.content,
      replyToMessageId: input.replyToMessageId || null,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Update conversation metadata
    const preview = input.content.slice(0, 100);
    await db
      .update(conversations)
      .set({
        lastMessageAt: now,
        lastMessagePreview: preview,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));

    // Update sender's last_read_at
    if (currentMember) {
      await db
        .update(conversationMembers)
        .set({ lastReadAt: now })
        .where(eq(conversationMembers.id, currentMember.id));
    }

    // 5. Generate notifications for other active unmuted members
    const senderName = currentMember?.user
      ? `${currentMember.user.firstName} ${currentMember.user.lastName}`
      : 'Someone';

    const otherMembers = conv.members.filter((m) => m.userId !== userId);

    const notificationInserts = [];
    for (const member of otherMembers) {
      // If member has muted this conversation, suppress general message notification
      if (member.mutedAt !== null) {
        continue;
      }

      notificationInserts.push({
        id: crypto.randomUUID(),
        tenantId,
        recipientUserId: member.userId,
        actorUserId: userId,
        type: 'NEW_MESSAGE' as const,
        conversationId,
        messageId,
        title: conv.conversationType === 'DIRECT' ? senderName : conv.name || 'New Message',
        body: input.content.slice(0, 150),
        isRead: false,
        createdAt: now,
      });
    }

    if (notificationInserts.length > 0) {
      try {
        await db.insert(notifications).values(notificationInserts);
      } catch {
        // non-critical notification error
      }
    }

    // Fetch and return the formatted message
    const inserted = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
      with: {
        sender: true,
        replyTo: {
          with: {
            sender: true,
          },
        },
      },
    });

    return {
      id: inserted!.id,
      tenantId: inserted!.tenantId,
      conversationId: inserted!.conversationId,
      senderUserId: inserted!.senderUserId,
      sender: {
        id: inserted!.sender.id,
        firstName: inserted!.sender.firstName,
        lastName: inserted!.sender.lastName,
        email: inserted!.sender.email,
        avatarUrl: inserted!.sender.avatarUrl,
      },
      messageType: inserted!.messageType,
      content: inserted!.content,
      replyToMessageId: inserted!.replyToMessageId,
      replyTo: inserted!.replyTo
        ? {
            id: inserted!.replyTo.id,
            content: inserted!.replyTo.deletedAt ? '[This message was deleted]' : inserted!.replyTo.content,
            senderName: `${inserted!.replyTo.sender.firstName} ${inserted!.replyTo.sender.lastName}`,
          }
        : null,
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      reactions: [],
      createdAt: inserted!.createdAt,
      updatedAt: inserted!.updatedAt,
    };
  }

  /**
   * Edit a message's content (sender or authorized admin only).
   */
  static async updateMessage(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    messageId: string,
    input: UpdateMessageInput,
    hasManagePermission: boolean,
    meta?: RequestMeta
  ) {
    const msg = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)),
    });

    if (!msg) {
      throw { code: 'MESSAGE_NOT_FOUND', message: 'Message not found.', status: 404 };
    }

    if (msg.deletedAt !== null) {
      throw {
        code: 'CANNOT_EDIT_DELETED_MESSAGE',
        message: 'Deleted messages cannot be edited.',
        status: 400,
      };
    }

    const isSender = msg.senderUserId === userId;
    if (!isSender && !hasManagePermission) {
      throw {
        code: 'MESSAGE_EDIT_FORBIDDEN',
        message: 'You can only edit your own messages.',
        status: 403,
      };
    }

    const now = new Date();
    await db
      .update(messages)
      .set({
        content: input.content,
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(messages.id, messageId));

    // Audit log (never log raw message content!)
    await this.audit(db, tenantId, userId, 'UPDATE', messageId, {
      action: 'EDIT_MESSAGE',
      conversationId: msg.conversationId,
    }, meta);

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      content: input.content,
      isEdited: true,
      editedAt: now,
    };
  }

  /**
   * Soft-delete a message (sender, conversation owner/admin, or authorized admin only).
   */
  static async deleteMessage(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    messageId: string,
    hasManagePermission: boolean,
    meta?: RequestMeta
  ) {
    const msg = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)),
      with: {
        conversation: {
          with: {
            members: {
              where: eq(conversationMembers.isActive, true),
            },
          },
        },
      },
    });

    if (!msg) {
      throw { code: 'MESSAGE_NOT_FOUND', message: 'Message not found.', status: 404 };
    }

    if (msg.deletedAt !== null) {
      return { success: true }; // already soft-deleted
    }

    const isSender = msg.senderUserId === userId;
    const myMembership = msg.conversation?.members.find((m) => m.userId === userId);
    const isConvAdminOrOwner = myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN');

    if (!isSender && !isConvAdminOrOwner && !hasManagePermission) {
      throw {
        code: 'MESSAGE_DELETE_FORBIDDEN',
        message: 'You can only delete your own messages or messages in conversations you manage.',
        status: 403,
      };
    }

    const now = new Date();
    await db
      .update(messages)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(messages.id, messageId));

    await this.audit(db, tenantId, userId, 'DELETE', messageId, {
      action: 'SOFT_DELETE_MESSAGE',
      conversationId: msg.conversationId,
    }, meta);

    return { success: true };
  }

  /**
   * Add a reaction to a message.
   */
  static async addReaction(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    messageId: string,
    reaction: string
  ) {
    const msg = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)),
      with: {
        conversation: {
          with: {
            members: {
              where: eq(conversationMembers.isActive, true),
            },
          },
        },
      },
    });

    if (!msg) {
      throw { code: 'MESSAGE_NOT_FOUND', message: 'Message not found.', status: 404 };
    }

    if (msg.deletedAt !== null) {
      throw {
        code: 'CANNOT_REACT_TO_DELETED',
        message: 'Cannot react to a deleted message.',
        status: 400,
      };
    }

    const isMember = msg.conversation?.members.some((m) => m.userId === userId);
    if (!isMember && msg.conversation?.conversationType !== 'CHANNEL') {
      throw {
        code: 'NOT_CONVERSATION_MEMBER',
        message: 'You must be a member of this conversation to react to messages.',
        status: 403,
      };
    }

    // Check for existing reaction
    const existing = await db.query.messageReactions.findFirst({
      where: and(
        eq(messageReactions.tenantId, tenantId),
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.reaction, reaction)
      ),
    });

    if (existing) {
      return { success: true, reaction: existing.reaction };
    }

    await db.insert(messageReactions).values({
      id: crypto.randomUUID(),
      tenantId,
      messageId,
      userId,
      reaction,
      createdAt: new Date(),
    });

    return { success: true, reaction };
  }

  /**
   * Remove a reaction from a message.
   */
  static async removeReaction(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    messageId: string,
    reaction: string
  ) {
    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.tenantId, tenantId),
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.reaction, reaction)
        )
      );

    return { success: true };
  }

  /**
   * Search messages within conversations accessible to the user.
   */
  static async searchMessages(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    query: SearchMessagesQuery
  ) {
    // 1. Get user's active conversations
    const userMemberships = await db.query.conversationMembers.findMany({
      where: and(
        eq(conversationMembers.tenantId, tenantId),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.isActive, true)
      ),
    });

    const accessibleConvIds = userMemberships.map((m) => m.conversationId);

    if (accessibleConvIds.length === 0) {
      return { items: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } };
    }

    const conditions = [
      eq(messages.tenantId, tenantId),
      sql`${messages.deletedAt} IS NULL`,
      like(sql`lower(${messages.content})`, `%${query.query.toLowerCase()}%`),
    ];

    if (query.conversationId) {
      if (!accessibleConvIds.includes(query.conversationId)) {
        throw {
          code: 'CONVERSATION_ACCESS_DENIED',
          message: 'You are not a member of the requested conversation.',
          status: 403,
        };
      }
      conditions.push(eq(messages.conversationId, query.conversationId));
    } else {
      conditions.push(inArray(messages.conversationId, accessibleConvIds));
    }

    const whereClause = and(...conditions);

    const totalRes = await db.select({ count: count() }).from(messages).where(whereClause);
    const total = totalRes[0]?.count || 0;

    const offset = (query.page - 1) * query.limit;

    const rows = await db.query.messages.findMany({
      where: whereClause,
      orderBy: [desc(messages.createdAt)],
      limit: query.limit,
      offset,
      with: {
        sender: true,
        conversation: true,
      },
    });

    const items = rows.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      conversationName: msg.conversation.name || msg.conversation.conversationType,
      conversationType: msg.conversation.conversationType,
      content: msg.content,
      sender: {
        id: msg.sender.id,
        firstName: msg.sender.firstName,
        lastName: msg.sender.lastName,
      },
      createdAt: msg.createdAt,
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
}
