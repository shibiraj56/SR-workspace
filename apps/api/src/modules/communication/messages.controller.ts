import { Hono } from 'hono';
import { MessagesService } from './messages.service';
import {
  updateMessageSchema,
  messageReactionSchema,
  searchMessagesQuerySchema,
} from './communication.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const messagesController = new Hono<HonoEnv>();

messagesController.use('*', authMiddleware());
messagesController.use('*', tenantMiddleware());

function getMeta(c: any) {
  return {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };
}

/**
 * GET /api/v1/messages/search
 * Search messages across user's conversations.
 */
messagesController.get('/search', requirePermission('communication:read'), async (c) => {
  const query = c.req.query();
  const validation = searchMessagesQuerySchema.safeParse(query);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid search query parameters.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await MessagesService.searchMessages(
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
 * PATCH /api/v1/messages/:id
 * Edit message content.
 */
messagesController.patch('/:id', requirePermission('communication:send'), async (c) => {
  const messageId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = updateMessageSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for message edit.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const userPerms = (user?.permissions || []).map((p) => p.replace('.', ':'));
  const hasManagePermission = Boolean(
    user?.roles?.includes('SUPER_ADMIN') ||
      user?.roles?.includes('TENANT_ADMIN') ||
      userPerms.includes('communication:manage_messages')
  );
  const meta = getMeta(c);

  try {
    const result = await MessagesService.updateMessage(
      db,
      tenantId,
      user?.id || '',
      messageId,
      validation.data,
      hasManagePermission,
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
 * DELETE /api/v1/messages/:id
 * Soft-delete a message.
 */
messagesController.delete('/:id', requirePermission('communication:send'), async (c) => {
  const messageId = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');
  const userPerms = (user?.permissions || []).map((p) => p.replace('.', ':'));
  const hasManagePermission = Boolean(
    user?.roles?.includes('SUPER_ADMIN') ||
      user?.roles?.includes('TENANT_ADMIN') ||
      userPerms.includes('communication:manage_messages')
  );
  const meta = getMeta(c);

  try {
    const result = await MessagesService.deleteMessage(
      db,
      tenantId,
      user?.id || '',
      messageId,
      hasManagePermission,
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
 * POST /api/v1/messages/:id/reactions
 * Add an emoji reaction to a message.
 */
messagesController.post('/:id/reactions', requirePermission('communication:send'), async (c) => {
  const messageId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'INVALID_JSON', 'Malformed JSON in request body.', 400);
  }

  const validation = messageReactionSchema.safeParse(body);
  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Validation failed for reaction payload.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await MessagesService.addReaction(
      db,
      tenantId,
      user?.id || '',
      messageId,
      validation.data.reaction
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
 * DELETE /api/v1/messages/:id/reactions
 * Remove an emoji reaction from a message.
 */
messagesController.delete('/:id/reactions', requirePermission('communication:send'), async (c) => {
  const messageId = c.req.param('id');
  let reaction = c.req.query('reaction');

  if (!reaction) {
    try {
      const body = await c.req.json();
      reaction = body?.reaction;
    } catch {
      // not in body either
    }
  }

  if (!reaction) {
    return apiError(c, 'VALIDATION_ERROR', 'Reaction emoji is required to remove reaction.', 400);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await MessagesService.removeReaction(
      db,
      tenantId,
      user?.id || '',
      messageId,
      reaction
    );
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
