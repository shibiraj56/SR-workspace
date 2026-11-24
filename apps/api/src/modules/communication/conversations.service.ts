import { eq, and, or, like, desc, asc, count, sql, inArray } from 'drizzle-orm';
import {
  type AppDatabase,
  conversations,
  conversationMembers,
  messages,
  notifications,
  projects,
  projectMembers,
  employees,
  users,
  userTenants,
  auditLogs,
  type ConversationType,
  type ConversationMemberRole,
} from '@sr-workspace/database';
import type {
  CreateConversationInput,
  UpdateConversationInput,
  ListConversationsQuery,
  AddConversationMemberInput,
} from './communication.schemas';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export class ConversationsService {
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
        entityType: 'conversation',
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
   * List conversations accessible to the current user within active tenant.
   */
  static async listConversations(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    query: ListConversationsQuery
  ) {
    // 1. Fetch conversation IDs where user is an active member
    const userMemberships = await db.query.conversationMembers.findMany({
      where: and(
        eq(conversationMembers.tenantId, tenantId),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.isActive, true)
      ),
    });

    const userConvIds = userMemberships.map((m) => m.conversationId);

    // Build conditions: user is a member OR conversation is a public CHANNEL
    const conditions = [
      eq(conversations.tenantId, tenantId),
      eq(conversations.isArchived, query.archived ?? false),
    ];

    if (query.type) {
      conditions.push(eq(conversations.conversationType, query.type));
    }

    if (query.projectId) {
      conditions.push(eq(conversations.projectId, query.projectId));
    }

    if (query.search) {
      const term = `%${query.search.toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`lower(${conversations.name})`, term),
          like(sql`lower(${conversations.lastMessagePreview})`, term)
        )!
      );
    }

    // Access control clause:
    // User can see conversation if they are an active member, OR if it's a CHANNEL
    if (userConvIds.length > 0) {
      conditions.push(
        or(
          inArray(conversations.id, userConvIds),
          eq(conversations.conversationType, 'CHANNEL')
        )!
      );
    } else {
      conditions.push(eq(conversations.conversationType, 'CHANNEL'));
    }

    const whereClause = and(...conditions);

    // Total count
    const totalResult = await db
      .select({ count: count() })
      .from(conversations)
      .where(whereClause);
    const total = totalResult[0]?.count || 0;

    const offset = (query.page - 1) * query.limit;

    // Fetch conversation records
    const convRows = await db.query.conversations.findMany({
      where: whereClause,
      orderBy: [desc(conversations.lastMessageAt), desc(conversations.createdAt)],
      limit: query.limit,
      offset,
      with: {
        project: true,
        members: {
          where: eq(conversationMembers.isActive, true),
          with: {
            user: true,
          },
        },
      },
    });

    // Membership map for current user
    const membershipMap = new Map(userMemberships.map((m) => [m.conversationId, m]));

    // Calculate unread counts and format
    const items = await Promise.all(
      convRows.map(async (conv) => {
        const myMembership = membershipMap.get(conv.id);
        const lastReadAt = myMembership?.lastReadAt;

        let unreadCount = 0;
        if (myMembership) {
          const unreadConditions = [
            eq(messages.tenantId, tenantId),
            eq(messages.conversationId, conv.id),
            sql`${messages.deletedAt} IS NULL`,
            sql`${messages.senderUserId} != ${userId}`,
          ];

          if (lastReadAt) {
            unreadConditions.push(sql`${messages.createdAt} > ${lastReadAt.getTime()}`);
          }

          const unreadRes = await db
            .select({ count: count() })
            .from(messages)
            .where(and(...unreadConditions));

          unreadCount = unreadRes[0]?.count || 0;
        }

        // Format participants/name for DIRECT conversations
        let displayName = conv.name;
        let otherUser = null;

        if (conv.conversationType === 'DIRECT') {
          const otherMember = conv.members.find((m) => m.userId !== userId);
          if (otherMember?.user) {
            displayName = `${otherMember.user.firstName} ${otherMember.user.lastName}`;
            otherUser = {
              id: otherMember.user.id,
              firstName: otherMember.user.firstName,
              lastName: otherMember.user.lastName,
              email: otherMember.user.email,
              avatarUrl: otherMember.user.avatarUrl,
            };
          }
        }

        return {
          id: conv.id,
          tenantId: conv.tenantId,
          type: conv.conversationType,
          name: displayName || 'Direct Message',
          description: conv.description,
          projectId: conv.projectId,
          project: conv.project
            ? {
                id: conv.project.id,
                projectCode: conv.project.projectCode,
                name: conv.project.name,
              }
            : null,
          directUser: otherUser,
          memberCount: conv.members.length,
          lastMessageAt: conv.lastMessageAt,
          lastMessagePreview: conv.lastMessagePreview,
          isArchived: conv.isArchived,
          unreadCount,
          membership: myMembership
            ? {
                role: myMembership.role,
                isMuted: myMembership.mutedAt !== null,
                mutedAt: myMembership.mutedAt,
                lastReadAt: myMembership.lastReadAt,
              }
            : null,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
      })
    );

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
   * Get single conversation details by ID with authorization check.
   */
  static async getConversationById(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string
  ) {
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)),
      with: {
        project: true,
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

    // Access check:
    const myMembership = conv.members.find((m) => m.userId === userId);

    if (!myMembership && conv.conversationType !== 'CHANNEL') {
      // If PROJECT conversation, verify project membership
      if (conv.conversationType === 'PROJECT' && conv.projectId) {
        const emp = await db.query.employees.findFirst({
          where: and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)),
        });
        const pm = await db.query.projectMembers.findFirst({
          where: and(
            eq(projectMembers.tenantId, tenantId),
            eq(projectMembers.projectId, conv.projectId),
            emp
              ? or(eq(projectMembers.employeeId, emp.id), eq(projectMembers.employeeId, userId))
              : eq(projectMembers.employeeId, userId)
          ),
        });
        if (!pm) {
          throw {
            code: 'CONVERSATION_ACCESS_DENIED',
            message: 'You are not a member of this conversation or project.',
            status: 403,
          };
        }
      } else {
        throw {
          code: 'CONVERSATION_ACCESS_DENIED',
          message: 'You are not an active member of this conversation.',
          status: 403,
        };
      }
    }

    let displayName = conv.name;
    let otherUser = null;
    if (conv.conversationType === 'DIRECT') {
      const otherMember = conv.members.find((m) => m.userId !== userId);
      if (otherMember?.user) {
        displayName = `${otherMember.user.firstName} ${otherMember.user.lastName}`;
        otherUser = {
          id: otherMember.user.id,
          firstName: otherMember.user.firstName,
          lastName: otherMember.user.lastName,
          email: otherMember.user.email,
          avatarUrl: otherMember.user.avatarUrl,
        };
      }
    }

    return {
      id: conv.id,
      tenantId: conv.tenantId,
      type: conv.conversationType,
      name: displayName || 'Direct Message',
      description: conv.description,
      projectId: conv.projectId,
      project: conv.project
        ? {
            id: conv.project.id,
            projectCode: conv.project.projectCode,
            name: conv.project.name,
          }
        : null,
      directUser: otherUser,
      members: conv.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
        },
      })),
      membership: myMembership
        ? {
            role: myMembership.role,
            isMuted: myMembership.mutedAt !== null,
            mutedAt: myMembership.mutedAt,
            lastReadAt: myMembership.lastReadAt,
          }
        : null,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview,
      isArchived: conv.isArchived,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  /**
   * Create a new conversation (DIRECT, GROUP, CHANNEL, or PROJECT).
   */
  static async createConversation(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    input: CreateConversationInput,
    meta?: RequestMeta
  ) {
    const now = new Date();

    // 1. DIRECT CONVERSATION
    if (input.type === 'DIRECT') {
      const targetUserId = input.participantUserIds?.find((id) => id !== userId);
      if (!targetUserId) {
        throw {
          code: 'CANNOT_CHAT_WITH_SELF',
          message: 'Direct conversation requires another participant user ID.',
          status: 400,
        };
      }

      // Verify target user is active in user_tenants for tenantId
      const targetUserTenant = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, targetUserId),
          eq(userTenants.tenantId, tenantId),
          eq(userTenants.status, 'ACTIVE')
        ),
        with: { user: true },
      });

      if (!targetUserTenant) {
        throw {
          code: 'USER_NOT_IN_TENANT',
          message: 'The selected user is not an active member of this workspace.',
          status: 400,
        };
      }

      // Canonical Ordering
      const directUser1Id = userId < targetUserId ? userId : targetUserId;
      const directUser2Id = userId < targetUserId ? targetUserId : userId;

      // Check if direct conversation already exists in this tenant
      const existing = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.directUser1Id, directUser1Id),
          eq(conversations.directUser2Id, directUser2Id)
        ),
      });

      if (existing) {
        // Return existing direct conversation cleanly
        return this.getConversationById(db, tenantId, userId, existing.id);
      }

      const convId = crypto.randomUUID();

      await db.insert(conversations).values({
        id: convId,
        tenantId,
        conversationType: 'DIRECT',
        directUser1Id,
        directUser2Id,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert both users as members
      await db.insert(conversationMembers).values([
        {
          id: crypto.randomUUID(),
          tenantId,
          conversationId: convId,
          userId: directUser1Id,
          role: 'MEMBER',
          joinedAt: now,
          isActive: true,
        },
        {
          id: crypto.randomUUID(),
          tenantId,
          conversationId: convId,
          userId: directUser2Id,
          role: 'MEMBER',
          joinedAt: now,
          isActive: true,
        },
      ]);

      await this.audit(db, tenantId, userId, 'CREATE', convId, {
        type: 'DIRECT',
        directUser1Id,
        directUser2Id,
      }, meta);

      return this.getConversationById(db, tenantId, userId, convId);
    }

    // 2. PROJECT CONVERSATION
    if (input.type === 'PROJECT') {
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId!), eq(projects.tenantId, tenantId)),
      });

      if (!project) {
        throw {
          code: 'PROJECT_NOT_FOUND',
          message: 'The specified project does not exist in this workspace.',
          status: 404,
        };
      }

      // Check if user is an active member of the project
      const emp = await db.query.employees.findFirst({
        where: and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)),
      });
      const pm = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.tenantId, tenantId),
          eq(projectMembers.projectId, input.projectId!),
          emp
            ? or(eq(projectMembers.employeeId, emp.id), eq(projectMembers.employeeId, userId))
            : eq(projectMembers.employeeId, userId)
        ),
      });
      if (!pm) {
        throw {
          code: 'NOT_PROJECT_MEMBER',
          message: 'You must be an active member of this project to create or access its discussion channel.',
          status: 403,
        };
      }

      // Check if conversation for this project already exists
      const existingProjectConv = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.conversationType, 'PROJECT'),
          eq(conversations.projectId, input.projectId!)
        ),
      });

      if (existingProjectConv) {
        return this.getConversationById(db, tenantId, userId, existingProjectConv.id);
      }

      const convId = crypto.randomUUID();
      const convName = input.name || `Project: ${project.name}`;

      await db.insert(conversations).values({
        id: convId,
        tenantId,
        conversationType: 'PROJECT',
        name: convName,
        description: input.description || project.description,
        projectId: input.projectId!,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Add creator as OWNER
      await db.insert(conversationMembers).values({
        id: crypto.randomUUID(),
        tenantId,
        conversationId: convId,
        userId,
        role: 'OWNER',
        joinedAt: now,
        isActive: true,
      });

      await this.audit(db, tenantId, userId, 'CREATE', convId, {
        type: 'PROJECT',
        name: convName,
        projectId: input.projectId,
      }, meta);

      return this.getConversationById(db, tenantId, userId, convId);
    }

    // 3. GROUP OR CHANNEL CONVERSATION
    const convId = crypto.randomUUID();

    await db.insert(conversations).values({
      id: convId,
      tenantId,
      conversationType: input.type,
      name: input.name!,
      description: input.description,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as OWNER
    const memberInserts = [
      {
        id: crypto.randomUUID(),
        tenantId,
        conversationId: convId,
        userId,
        role: 'OWNER' as ConversationMemberRole,
        joinedAt: now,
        isActive: true,
      },
    ];

    // Add initial participants if provided
    if (input.participantUserIds && input.participantUserIds.length > 0) {
      const uniqueParticipants = Array.from(new Set(input.participantUserIds.filter((id) => id !== userId)));

      // Verify all participants belong to the tenant
      if (uniqueParticipants.length > 0) {
        const validMemberships = await db.query.userTenants.findMany({
          where: and(
            eq(userTenants.tenantId, tenantId),
            inArray(userTenants.userId, uniqueParticipants),
            eq(userTenants.status, 'ACTIVE')
          ),
        });

        const validUserIds = new Set(validMemberships.map((m) => m.userId));

        for (const pId of uniqueParticipants) {
          if (validUserIds.has(pId)) {
            memberInserts.push({
              id: crypto.randomUUID(),
              tenantId,
              conversationId: convId,
              userId: pId,
              role: 'MEMBER' as ConversationMemberRole,
              joinedAt: now,
              isActive: true,
            });
          }
        }
      }
    }

    await db.insert(conversationMembers).values(memberInserts);

    await this.audit(db, tenantId, userId, 'CREATE', convId, {
      type: input.type,
      name: input.name,
      memberCount: memberInserts.length,
    }, meta);

    return this.getConversationById(db, tenantId, userId, convId);
  }

  /**
   * Update conversation details (name, description, isArchived).
   */
  static async updateConversation(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    input: UpdateConversationInput,
    isTenantAdmin: boolean,
    meta?: RequestMeta
  ) {
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

    if (conv.conversationType === 'DIRECT') {
      throw {
        code: 'CANNOT_MODIFY_DIRECT',
        message: 'Direct conversations cannot be renamed or modified directly.',
        status: 400,
      };
    }

    // Check permission: OWNER, ADMIN, or tenant admin
    const myMembership = conv.members.find((m) => m.userId === userId);
    const isOwnerOrAdmin = myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN');

    if (!isTenantAdmin && !isOwnerOrAdmin) {
      throw {
        code: 'CONVERSATION_FORBIDDEN',
        message: 'Only conversation owner or administrator can update details.',
        status: 403,
      };
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

    await db.update(conversations).set(updates).where(eq(conversations.id, conversationId));

    await this.audit(db, tenantId, userId, 'UPDATE', conversationId, updates, meta);

    return this.getConversationById(db, tenantId, userId, conversationId);
  }

  /**
   * Delete or archive conversation.
   */
  static async deleteConversation(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    isTenantAdmin: boolean,
    meta?: RequestMeta
  ) {
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

    const myMembership = conv.members.find((m) => m.userId === userId);
    const isOwner = myMembership && myMembership.role === 'OWNER';

    if (!isTenantAdmin && !isOwner) {
      throw {
        code: 'CONVERSATION_FORBIDDEN',
        message: 'Only the conversation owner or administrator can delete this conversation.',
        status: 403,
      };
    }

    // Delete conversation (cascades to members, messages, reactions, notifications)
    await db.delete(conversations).where(eq(conversations.id, conversationId));

    await this.audit(db, tenantId, userId, 'DELETE', conversationId, {
      name: conv.name,
      type: conv.conversationType,
    }, meta);

    return { success: true };
  }

  /**
   * Add a member to a conversation.
   */
  static async addMember(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    input: AddConversationMemberInput,
    isTenantAdmin: boolean,
    meta?: RequestMeta
  ) {
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)),
      with: {
        members: true,
      },
    });

    if (!conv) {
      throw { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.', status: 404 };
    }

    if (conv.conversationType === 'DIRECT') {
      throw {
        code: 'CANNOT_ADD_MEMBERS_TO_DIRECT',
        message: 'Cannot add additional members to a direct 1-on-1 conversation.',
        status: 400,
      };
    }

    // Check permission: OWNER, ADMIN, or tenant admin
    const myMembership = conv.members.find((m) => m.userId === userId && m.isActive);
    const isOwnerOrAdmin = myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN');

    if (!isTenantAdmin && !isOwnerOrAdmin) {
      throw {
        code: 'CONVERSATION_FORBIDDEN',
        message: 'Only conversation owners or administrators can add members.',
        status: 403,
      };
    }

    // Verify target user is active in tenant
    const targetUserTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, input.userId),
        eq(userTenants.tenantId, tenantId),
        eq(userTenants.status, 'ACTIVE')
      ),
      with: { user: true },
    });

    if (!targetUserTenant) {
      throw {
        code: 'USER_NOT_IN_TENANT',
        message: 'Target user is not an active member of this workspace.',
        status: 400,
      };
    }

    // For PROJECT conversation, target user must be an active project member
    if (conv.conversationType === 'PROJECT' && conv.projectId) {
      const emp = await db.query.employees.findFirst({
        where: and(eq(employees.userId, input.userId), eq(employees.tenantId, tenantId)),
      });
      const pm = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.tenantId, tenantId),
          eq(projectMembers.projectId, conv.projectId),
          emp
            ? or(eq(projectMembers.employeeId, emp.id), eq(projectMembers.employeeId, input.userId))
            : eq(projectMembers.employeeId, input.userId)
        ),
      });
      if (!pm) {
        throw {
          code: 'USER_NOT_PROJECT_MEMBER',
          message: 'Target user is not a member of the linked project.',
          status: 400,
        };
      }
    }

    const existingMember = conv.members.find((m) => m.userId === input.userId);
    const now = new Date();

    if (existingMember) {
      if (existingMember.isActive) {
        throw {
          code: 'MEMBER_ALREADY_EXISTS',
          message: 'User is already an active member of this conversation.',
          status: 409,
        };
      }

      // Reactivate previously left member
      await db
        .update(conversationMembers)
        .set({
          isActive: true,
          role: input.role || 'MEMBER',
          joinedAt: now,
        })
        .where(eq(conversationMembers.id, existingMember.id));
    } else {
      await db.insert(conversationMembers).values({
        id: crypto.randomUUID(),
        tenantId,
        conversationId,
        userId: input.userId,
        role: input.role || 'MEMBER',
        joinedAt: now,
        isActive: true,
      });
    }

    // Create invitation notification
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        tenantId,
        recipientUserId: input.userId,
        actorUserId: userId,
        type: conv.conversationType === 'CHANNEL' ? 'CHANNEL_INVITATION' : 'GROUP_INVITATION',
        conversationId,
        title: `Added to ${conv.name}`,
        body: `You were added to the ${conv.conversationType.toLowerCase()} "${conv.name}".`,
        createdAt: now,
      });
    } catch {
      // non-critical notification error
    }

    await this.audit(db, tenantId, userId, 'UPDATE', conversationId, {
      action: 'ADD_MEMBER',
      addedUserId: input.userId,
      role: input.role,
    }, meta);

    return this.getConversationById(db, tenantId, userId, conversationId);
  }

  /**
   * Remove member or leave conversation.
   */
  static async removeMember(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    targetUserId: string,
    isTenantAdmin: boolean,
    meta?: RequestMeta
  ) {
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

    if (conv.conversationType === 'DIRECT') {
      throw {
        code: 'CANNOT_LEAVE_DIRECT',
        message: 'Cannot leave or remove participants from a direct conversation.',
        status: 400,
      };
    }

    const isSelf = userId === targetUserId;
    const targetMember = conv.members.find((m) => m.userId === targetUserId);

    if (!targetMember) {
      throw {
        code: 'MEMBER_NOT_FOUND',
        message: 'Target user is not an active member of this conversation.',
        status: 404,
      };
    }

    if (!isSelf) {
      // Requester removing someone else
      const myMembership = conv.members.find((m) => m.userId === userId);
      const isOwnerOrAdmin = myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN');

      if (!isTenantAdmin && !isOwnerOrAdmin) {
        throw {
          code: 'CONVERSATION_FORBIDDEN',
          message: 'Only conversation owners or administrators can remove members.',
          status: 403,
        };
      }

      if (targetMember.role === 'OWNER' && !isTenantAdmin) {
        throw {
          code: 'CANNOT_REMOVE_OWNER',
          message: 'Conversation owner cannot be removed.',
          status: 400,
        };
      }
    }

    // Set inactive (soft removal)
    await db
      .update(conversationMembers)
      .set({ isActive: false })
      .where(eq(conversationMembers.id, targetMember.id));

    await this.audit(db, tenantId, userId, 'UPDATE', conversationId, {
      action: isSelf ? 'LEAVE' : 'REMOVE_MEMBER',
      removedUserId: targetUserId,
    }, meta);

    return { success: true };
  }

  /**
   * Mark conversation as read and dismiss unread notifications.
   */
  static async markAsRead(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string
  ) {
    const now = new Date();

    const member = await db.query.conversationMembers.findFirst({
      where: and(
        eq(conversationMembers.tenantId, tenantId),
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.isActive, true)
      ),
    });

    if (member) {
      await db
        .update(conversationMembers)
        .set({ lastReadAt: now })
        .where(eq(conversationMembers.id, member.id));
    }

    // Mark relevant notifications as read
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.recipientUserId, userId),
          eq(notifications.conversationId, conversationId),
          eq(notifications.isRead, false)
        )
      );

    return { success: true, lastReadAt: now };
  }

  /**
   * Toggle mute status for conversation.
   */
  static async muteConversation(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    conversationId: string,
    muted: boolean
  ) {
    const member = await db.query.conversationMembers.findFirst({
      where: and(
        eq(conversationMembers.tenantId, tenantId),
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.isActive, true)
      ),
    });

    if (!member) {
      throw {
        code: 'NOT_A_MEMBER',
        message: 'You are not an active member of this conversation.',
        status: 403,
      };
    }

    const mutedAt = muted ? new Date() : null;

    await db
      .update(conversationMembers)
      .set({ mutedAt })
      .where(eq(conversationMembers.id, member.id));

    return {
      success: true,
      isMuted: muted,
      mutedAt,
    };
  }
}
