import { Hono } from 'hono';
import { DepartmentsService } from './departments.service';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  updateDepartmentStatusSchema,
  listDepartmentsQuerySchema,
} from './departments.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const departmentsController = new Hono<HonoEnv>();

// Apply authentication and tenant context isolation to all department routes
departmentsController.use('*', authMiddleware(), tenantMiddleware());

/**
 * GET /api/v1/departments
 * List departments with search, status filtering, and pagination.
 */
departmentsController.get('/', requirePermission('departments:read'), async (c) => {
  const queryResult = listDepartmentsQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid query parameters.', 400, queryResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await DepartmentsService.listDepartments(db, tenantId, queryResult.data);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/departments/:id
 * Retrieve a single department by ID.
 */
departmentsController.get('/:id', requirePermission('departments:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const department = await DepartmentsService.getDepartmentById(db, tenantId, id);
    return apiSuccess(c, department, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/departments
 * Create a new department in the active workspace.
 */
departmentsController.post('/', requirePermission('departments:create'), async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = createDepartmentSchema.safeParse(rawBody);

  if (!validation.success) {
    const details = validation.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  const meta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };

  try {
    const department = await DepartmentsService.createDepartment(
      db,
      tenantId,
      user.id,
      validation.data,
      meta
    );
    return apiSuccess(c, department, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/departments/:id
 * Update an existing department.
 */
departmentsController.patch('/:id', requirePermission('departments:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateDepartmentSchema.safeParse(rawBody);

  if (!validation.success) {
    const details = validation.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  const meta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };

  try {
    const department = await DepartmentsService.updateDepartment(
      db,
      tenantId,
      user.id,
      id,
      validation.data,
      meta
    );
    return apiSuccess(c, department, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/departments/:id/status
 * Update department active/inactive status.
 */
departmentsController.patch('/:id/status', requirePermission('departments:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateDepartmentStatusSchema.safeParse(rawBody);

  if (!validation.success) {
    const details = validation.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  const meta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };

  try {
    const department = await DepartmentsService.updateDepartmentStatus(
      db,
      tenantId,
      user.id,
      id,
      validation.data.status,
      meta
    );
    return apiSuccess(c, department, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/departments/:id
 * Delete or archive department.
 * Blocked if employees are currently assigned to the department.
 */
departmentsController.delete('/:id', requirePermission('departments:delete'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  const meta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };

  try {
    const result = await DepartmentsService.deleteDepartment(db, tenantId, user.id, id, meta);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
