import { Hono } from 'hono';
import { EmployeesService } from './employees.service';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
  listEmployeesQuerySchema,
} from './employees.schemas';
import { InvitationsService } from '../invitations/invitations.service';
import { inviteEmployeeSchema } from '../invitations/invitations.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const employeesController = new Hono<HonoEnv>();

// Apply authentication and tenant context isolation to all employee routes
employeesController.use('*', authMiddleware(), tenantMiddleware());

/**
 * GET /api/v1/employees
 * List employees with search, department/status/type filters, pagination, and sorting.
 */
employeesController.get('/', requirePermission('employees:read'), async (c) => {
  const queryResult = listEmployeesQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid query parameters.', 400, queryResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const result = await EmployeesService.listEmployees(db, tenantId, queryResult.data);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/employees/:id
 * Retrieve a single employee by ID.
 */
employeesController.get('/:id', requirePermission('employees:read'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const employee = await EmployeesService.getEmployeeById(db, tenantId, id);
    return apiSuccess(c, employee, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/employees
 * Create a new employee in the active workspace.
 */
employeesController.post('/', requirePermission('employees:create'), async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = createEmployeeSchema.safeParse(rawBody);

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
    const employee = await EmployeesService.createEmployee(
      db,
      tenantId,
      user.id,
      validation.data,
      meta
    );
    return apiSuccess(c, employee, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/employees/:id
 * Update an existing employee.
 */
employeesController.patch('/:id', requirePermission('employees:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateEmployeeSchema.safeParse(rawBody);

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
    const employee = await EmployeesService.updateEmployee(
      db,
      tenantId,
      user.id,
      id,
      validation.data,
      meta
    );
    return apiSuccess(c, employee, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/employees/:id/status
 * Update an employee's employment status.
 */
employeesController.patch('/:id/status', requirePermission('employees:update'), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = updateEmployeeStatusSchema.safeParse(rawBody);

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
    const employee = await EmployeesService.updateEmployeeStatus(
      db,
      tenantId,
      user.id,
      id,
      validation.data.status,
      meta
    );
    return apiSuccess(c, employee, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/employees/:id
 * Delete or archive an employee.
 */
employeesController.delete('/:id', requirePermission('employees:delete'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  const meta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  };

  try {
    const result = await EmployeesService.deleteEmployee(db, tenantId, user.id, id, meta);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/employees/:id/invite
 * Issue an invitation for an employee to register and link their user account.
 */
employeesController.post('/:id/invite', requirePermission(['employees:create', 'users:create']), async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = inviteEmployeeSchema.safeParse(rawBody);

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
    const result = await InvitationsService.createInvitation(
      db,
      tenantId,
      id,
      user.id,
      validation.data,
      meta
    );

    // Return safe invitation details without exposing stored token hash or plain token in the HTTP API response
    return apiSuccess(c, result.invitation, 201);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
