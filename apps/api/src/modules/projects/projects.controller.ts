import { Hono } from 'hono';
import { ProjectsService } from './projects.service';
import {
  listProjectsQuerySchema,
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
  updateProjectPrioritySchema,
  addProjectMemberSchema,
} from './projects.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const projectsController = new Hono<HonoEnv>();

// Apply auth and tenant middleware to all project endpoints
projectsController.use('*', authMiddleware());
projectsController.use('*', tenantMiddleware());

function getMeta(c: any) {
  return {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };
}

/**
 * GET /api/v1/projects
 * List projects with pagination and filters.
 */
projectsController.get('/', requirePermission('projects:read'), async (c) => {
  const query = c.req.query();
  const validation = listProjectsQuerySchema.safeParse(query);

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
    const result = await ProjectsService.listProjects(db, tenantId, validation.data);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/projects/:id
 * Get single project details.
 */
projectsController.get('/:id', requirePermission('projects:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await ProjectsService.getProjectById(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/projects
 * Create a new project.
 */
projectsController.post('/', requirePermission('projects:create'), async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = createProjectSchema.safeParse(rawBody);

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
    const result = await ProjectsService.createProject(
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
 * PUT /api/v1/projects/:id
 * Update project details.
 */
projectsController.put('/:id', requirePermission('projects:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateProjectSchema.safeParse(rawBody);

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
    const result = await ProjectsService.updateProject(
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
 * PATCH /api/v1/projects/:id/status
 * Update project status.
 */
projectsController.patch('/:id/status', requirePermission('projects:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateProjectStatusSchema.safeParse(rawBody);

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
    const result = await ProjectsService.updateProjectStatus(
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
 * PATCH /api/v1/projects/:id/priority
 * Update project priority.
 */
projectsController.patch('/:id/priority', requirePermission('projects:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateProjectPrioritySchema.safeParse(rawBody);

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
    const result = await ProjectsService.updateProjectPriority(
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
 * DELETE /api/v1/projects/:id
 * Delete project (blocked if active tasks exist).
 */
projectsController.delete('/:id', requirePermission('projects:delete'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await ProjectsService.deleteProject(
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
 * GET /api/v1/projects/:id/members
 * Get all project members.
 */
projectsController.get('/:id/members', requirePermission('projects:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await ProjectsService.getProjectMembers(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/projects/:id/members
 * Add a member to the project.
 */
projectsController.post('/:id/members', requirePermission('projects:manage_members'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = addProjectMemberSchema.safeParse(rawBody);

  if (!validation.success) {
    return apiError(
      c,
      'VALIDATION_ERROR',
      'Invalid member data.',
      400,
      validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user');

  try {
    const result = await ProjectsService.addProjectMember(
      db,
      tenantId,
      user?.id || '',
      id,
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
 * DELETE /api/v1/projects/:id/members/:employeeId
 * Remove a member from the project.
 */
projectsController.delete(
  '/:id/members/:employeeId',
  requirePermission('projects:manage_members'),
  async (c) => {
    const projectId = c.req.param('id');
    const employeeId = c.req.param('employeeId');
    const db = getDb(c);
    const { tenantId } = getTenantScope(c);
    const user = c.get('user');

    try {
      const result = await ProjectsService.removeProjectMember(
        db,
        tenantId,
        user?.id || '',
        projectId,
        employeeId,
        getMeta(c)
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
 * GET /api/v1/projects/:id/tasks
 * Get all tasks for a project.
 */
projectsController.get('/:id/tasks', requirePermission('tasks:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await ProjectsService.getProjectTasks(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/projects/:id/statistics
 * Get project task statistics and completion percentage.
 */
projectsController.get('/:id/statistics', requirePermission('projects:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await ProjectsService.getProjectStatistics(db, tenantId, id);
    return apiSuccess(c, result);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
