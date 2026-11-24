import { Hono } from 'hono';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import {
  listConversationsQuerySchema,
  createConversationSchema,
  updateConversationSchema,
  addConversationMemberSchema,
  muteConversationSchema,
  listMessagesQuerySchema,
  createMessageSchema,
} from './communication.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const conversationsController = new Hono<HonoEnv>();

conversationsController.use('*', authMiddleware());
conversationsController.use('*', tenantMiddleware());

function getMeta(c: any) {
  return {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };
}

/**
 * GET /api/v1/conversations
 * List conversations accessible to the current user in active tenant.
 */
conversationsController.get('/', requirePermission('communication:read'), async (c) => {
  const query = c.req.query();
  const validation = listConversationsQuerySchema.safeParse(query);

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
    const result = await ConversationsService.listConversations(
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
 * GET /api/v1/conversations/:id
 * Get details of a single conversation.
 */
conversationsController.get('/:id', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await ConversationsService.getConversationById(
      db,
      tenantId,
      user?.id || '',
      conversationId
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
 * POST /api/v1/conversations
 * Create a new conversation (DIRECT, GROUP, CHANNEL, or PROJECT).
 */
conversationsController.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = createConversationSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for conversation creation.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const user = c.get('user');
  if (!user) {
    return apiError(c, 'AUTH_UNAUTHORIZED', 'Authentication required.', 401);
  }

  // RBAC permission check according to type:
  // DIRECT / PROJECT -> communication:send
  // GROUP -> communication:create_group
  // CHANNEL -> communication:create_channel
  const isSuperOrTenantAdmin = user.roles?.includes('SUPER_ADMIN') || user.roles?.includes('TENANT_ADMIN');
  const userPerms = (user.permissions || []).map((p) => p.replace('.', ':'));

  if (!isSuperOrTenantAdmin) {
    const type = validation.data.type;
    if (type === 'CHANNEL') {
      const canCreateChannel =
        user.roles?.includes('ORG_ADMIN') || userPerms.includes('communication:create_channel');
      if (!canCreateChannel) {
        return apiError(
          c,
          'RBAC_FORBIDDEN',
          'Access denied: You do not have permission to create channels (communication:create_channel required).',
          403
        );
      }
    } else if (type === 'GROUP') {
      const canCreateGroup =
        user.roles?.some((r) => ['EMPLOYEE', 'BRANCH_MANAGER', 'ORG_ADMIN'].includes(r)) ||
        userPerms.includes('communication:create_group');
      if (!canCreateGroup) {
        return apiError(
          c,
          'RBAC_FORBIDDEN',
          'Access denied: You do not have permission to create groups.',
          403
        );
      }
    } else {
      // DIRECT or PROJECT
      const canSend =
        user.roles?.some((r) => ['EMPLOYEE', 'BRANCH_MANAGER', 'ORG_ADMIN'].includes(r)) ||
        userPerms.includes('communication:send');
      if (!canSend) {
        return apiError(
          c,
          'RBAC_FORBIDDEN',
          'Access denied: You do not have permission to start direct conversations.',
          403
        );
      }
    }
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const meta = getMeta(c);

  try {
    const result = await ConversationsService.createConversation(
      db,
      tenantId,
      user.id,
      validation.data,
      meta
    );
    return apiSuccess(c, result, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/conversations/:id
 * Update conversation details.
 */
conversationsController.patch('/:id', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = updateConversationSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for conversation update.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const isTenantAdmin = Boolean(
    user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('TENANT_ADMIN')
  );
  const meta = getMeta(c);

  try {
    const result = await ConversationsService.updateConversation(
      db,
      tenantId,
      user?.id || '',
      conversationId,
      validation.data,
      isTenantAdmin,
      meta
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
 * DELETE /api/v1/conversations/:id
 * Delete or archive conversation.
 */
conversationsController.delete('/:id', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const isTenantAdmin = Boolean(
    user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('TENANT_ADMIN')
  );
  const meta = getMeta(c);

  try {
    const result = await ConversationsService.deleteConversation(
      db,
      tenantId,
      user?.id || '',
      conversationId,
      isTenantAdmin,
      meta
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
 * GET /api/v1/conversations/:id/members
 * Get members list for a conversation.
 */
conversationsController.get('/:id/members', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const conv = await ConversationsService.getConversationById(
      db,
      tenantId,
      user?.id || '',
      conversationId
    );
    return apiSuccess(c, conv.members);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/conversations/:id/members
 * Add a member to the conversation.
 */
conversationsController.post('/:id/members', async (c) => {
  const conversationId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = addConversationMemberSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for adding conversation member.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const isTenantAdmin = Boolean(
    user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('TENANT_ADMIN')
  );
  const meta = getMeta(c);

  try {
    const result = await ConversationsService.addMember(
      db,
      tenantId,
      user?.id || '',
      conversationId,
      validation.data,
      isTenantAdmin,
      meta
    );
    return apiSuccess(c, result, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/conversations/:id/members/:userId
 * Remove a member from conversation or leave conversation.
 */
conversationsController.delete(
  '/:id/members/:userId',
  requirePermission('communication:read'),
  async (c) => {
    const conversationId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    const db = getDb(c);
    const { tenantId } = getTenantScope(c);
    const user = c.get('user');
    const isTenantAdmin = Boolean(
      user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('TENANT_ADMIN')
    );
    const meta = getMeta(c);

    try {
      const result = await ConversationsService.removeMember(
        db,
        tenantId,
        user?.id || '',
        conversationId,
        targetUserId,
        isTenantAdmin,
        meta
      );
      return apiSuccess(c, result);
    } catch (err: any) {
      if (err.code && err.status) {
        return apiError(c, err.code, err.message, err.status);
      }
      throw err;
    }
  }
);

/**
 * POST /api/v1/conversations/:id/read
 * Mark conversation as read and dismiss notifications.
 */
conversationsController.post('/:id/read', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await ConversationsService.markAsRead(
      db,
      tenantId,
      user?.id || '',
      conversationId
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
 * POST /api/v1/conversations/:id/mute
 * Toggle mute notifications for a conversation.
 */
conversationsController.post('/:id/mute', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Body optional, defaults to true
  }

  const validation = muteConversationSchema.safeParse(body);
  const muted = validation.success ? validation.data.muted : true;

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await ConversationsService.muteConversation(
      db,
      tenantId,
      user?.id || '',
      conversationId,
      muted
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
 * GET /api/v1/conversations/:id/messages
 * List messages in a conversation with composite cursor pagination.
 */
conversationsController.get('/:id/messages', requirePermission('communication:read'), async (c) => {
  const conversationId = c.req.param('id');
  const query = c.req.query();
  const validation = listMessagesQuerySchema.safeParse(query);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid pagination query parameters.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await MessagesService.listMessages(
      db,
      tenantId,
      user?.id || '',
      conversationId,
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
 * POST /api/v1/conversations/:id/messages
 * Post a new message to the conversation.
 */
conversationsController.post('/:id/messages', requirePermission('communication:send'), async (c) => {
  const conversationId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = createMessageSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for message content.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const meta = getMeta(c);

  try {
    const result = await MessagesService.createMessage(
      db,
      tenantId,
      user?.id || '',
      conversationId,
      validation.data,
      meta
    );
    return apiSuccess(c, result, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
