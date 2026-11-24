import { Hono } from 'hono';
import { TasksService } from './tasks.service';
import {
  listTasksQuerySchema,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  updateTaskAssigneeSchema,
  updateTaskPositionSchema,
  createTaskCommentSchema,
  updateTaskCommentSchema,
} from './tasks.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const tasksController = new Hono<HonoEnv>();

// Apply auth and tenant middleware
tasksController.use('*', authMiddleware());
tasksController.use('*', tenantMiddleware());

function getMeta(c: any) {
  return {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };
}

/**
 * GET /api/v1/tasks/dashboard/statistics
 * Get real project and task statistics for dashboard.
 */
tasksController.get('/dashboard/statistics', requirePermission(['projects:read', 'tasks:read']), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.getDashboardStatistics(db, tenantId, user?.id || '');
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/tasks
 * List tasks with pagination and filters.
 */
tasksController.get('/', requirePermission('tasks:read'), async (c) => {
  const query = c.req.query();
  const validation = listTasksQuerySchema.safeParse(query);

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

  try {
    const result = await TasksService.listTasks(db, tenantId, validation.data);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/tasks/:id
 * Get single task details with comments and activity.
 */
tasksController.get('/:id', requirePermission('tasks:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await TasksService.getTaskById(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/tasks
 * Create a new task.
 */
tasksController.post('/', requirePermission('tasks:create'), async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = createTaskSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Request validation failed.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.createTask(
      db,
      tenantId,
      user?.id || '',
      validation.data,
      getMeta(c)
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
 * PUT /api/v1/tasks/:id
 * Update task details.
 */
tasksController.put('/:id', requirePermission('tasks:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateTaskSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Request validation failed.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.updateTask(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data,
      getMeta(c)
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
 * PATCH /api/v1/tasks/:id/status
 * Quick status change.
 */
tasksController.patch('/:id/status', requirePermission('tasks:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateTaskStatusSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid status provided.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.updateTaskStatus(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data.status,
      getMeta(c)
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
 * PATCH /api/v1/tasks/:id/priority
 * Update task priority.
 */
tasksController.patch('/:id/priority', requirePermission('tasks:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateTaskPrioritySchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid priority provided.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.updateTaskPriority(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data.priority,
      getMeta(c)
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
 * PATCH /api/v1/tasks/:id/assignee
 * Update task assignee.
 */
tasksController.patch('/:id/assignee', requirePermission('tasks:assign'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateTaskAssigneeSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid assignee provided.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.updateTaskAssignee(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data.assigneeEmployeeId,
      getMeta(c)
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
 * PATCH /api/v1/tasks/:id/position
 * Update task ordering and position on Kanban.
 */
tasksController.patch('/:id/position', requirePermission('tasks:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateTaskPositionSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid position provided.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.updateTaskPosition(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data.position,
      validation.data.status,
      getMeta(c)
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
 * DELETE /api/v1/tasks/:id
 * Delete a task.
 */
tasksController.delete('/:id', requirePermission('tasks:delete'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.deleteTask(
      db,
      tenantId,
      user?.id || '',
      id,
      getMeta(c)
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
 * GET /api/v1/tasks/:id/comments
 * Get comments for a task.
 */
tasksController.get('/:id/comments', requirePermission('tasks:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await TasksService.getTaskComments(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/tasks/:id/comments
 * Add a comment to a task.
 */
tasksController.post('/:id/comments', requirePermission('tasks:manage_comments'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = createTaskCommentSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid comment content.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await TasksService.createTaskComment(
      db,
      tenantId,
      user?.id || '',
      id,
      validation.data.content
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
 * PUT /api/v1/tasks/:id/comments/:commentId
 * Update a task comment.
 */
tasksController.put(
  '/:id/comments/:commentId',
  requirePermission('tasks:manage_comments'),
  async (c) => {
    const taskId = c.req.param('id');
    const commentId = c.req.param('commentId');
    const rawBody = await c.req.json().catch(() => ({}));
    const validation = updateTaskCommentSchema.safeParse(rawBody);

    if (!validation.success) {
      return apiError(
        c,
        'VALIDATION_ERROR',
        'Invalid comment content.',
        400,
        validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      );
    }

    const db = getDb(c);
    const { tenantId } = getTenantScope(c);
    const user = c.get('user');

    try {
      const result = await TasksService.updateTaskComment(
        db,
        tenantId,
        user?.id || '',
        taskId,
        commentId,
        validation.data.content
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
 * DELETE /api/v1/tasks/:id/comments/:commentId
 * Delete a task comment.
 */
tasksController.delete(
  '/:id/comments/:commentId',
  requirePermission('tasks:manage_comments'),
  async (c) => {
    const taskId = c.req.param('id');
    const commentId = c.req.param('commentId');
    const db = getDb(c);
    const { tenantId } = getTenantScope(c);
    const user = c.get('user');

    try {
      const result = await TasksService.deleteTaskComment(
        db,
        tenantId,
        user?.id || '',
        taskId,
        commentId
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
 * GET /api/v1/tasks/:id/activity
 * Get activity history for a task.
 */
tasksController.get('/:id/activity', requirePermission('tasks:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await TasksService.getTaskActivity(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
