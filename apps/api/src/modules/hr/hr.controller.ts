import { Hono } from 'hono';
import { HrService } from './hr.service';
import {
  createOnboardingTaskSchema,
  updateOnboardingTaskSchema,
  createResignationSchema,
  updateResignationSchema,
  updateExitChecklistSchema,
  createDocumentMetadataSchema,
  updateDocumentMetadataSchema,
  punchInSchema,
  punchOutSchema,
  listAttendanceQuerySchema,
  createRegularizationSchema,
  updateRegularizationSchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createLeaveAllocationSchema,
  createLeaveRequestSchema,
  listLeaveRequestsQuerySchema,
  reviewLeaveRequestSchema,
  createShiftSchema,
  updateShiftSchema,
  assignShiftSchema,
  updateEmployeeShiftSchema,
  createHolidaySchema,
  updateHolidaySchema,
  listHolidaysQuerySchema,
  createPerformanceCycleSchema,
  updatePerformanceCycleSchema,
  createPerformanceReviewSchema,
  updatePerformanceReviewSchema,
  submitPerformanceReviewSchema,
  reportQuerySchema,
} from './hr.schemas';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware, getTenantScope } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { getDb } from '../../lib/db';
import { apiSuccess, apiError } from '../../lib/response';
import type { HonoEnv } from '../../types/context';

export const hrController = new Hono<HonoEnv>();

// Apply auth and tenant scoping to all HR endpoints
hrController.use('*', authMiddleware(), tenantMiddleware());

// ==========================================
// A. EMPLOYEE LIFECYCLE
// ==========================================

hrController.get('/employees/:employeeId/lifecycle', requirePermission('hr:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  // Verify caller identity: non-HR users can only read their own lifecycle
  const isHR = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'HR_MANAGER'].includes(r));
  if (!isHR) {
    const callerEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!callerEmp || callerEmp.id !== employeeId) {
      return apiError(c, 'FORBIDDEN', 'Access to employee lifecycle records is restricted to HR and self.', 403);
    }
  }

  try {
    const data = await HrService.getLifecycle(db, tenantId, employeeId);
    return apiSuccess(c, data, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/employees/:employeeId/onboarding', requirePermission('hr:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createOnboardingTaskSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid onboarding task data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  try {
    const task = await HrService.createOnboardingTask(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, task, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/employees/:employeeId/onboarding', requirePermission('hr:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const employeeId = c.req.param('employeeId');

  try {
    const tasks = await HrService.getOnboardingTasks(db, tenantId, employeeId);
    return apiSuccess(c, tasks, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/onboarding/:taskId', requirePermission('hr:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateOnboardingTaskSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid task update data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const taskId = c.req.param('taskId');

  try {
    const updated = await HrService.updateOnboardingTask(db, tenantId, taskId, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/employees/:employeeId/resignations', requirePermission('hr:read'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createResignationSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid resignation payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  try {
    const resignation = await HrService.createResignation(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, resignation, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/resignations/:id', requirePermission('hr:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateResignationSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid resignation update payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);

  try {
    const updated = await HrService.updateResignation(db, tenantId, id, parseResult.data, user.id, actingEmp?.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/employees/:employeeId/exit-checklist', requirePermission('hr:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  const isHR = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'HR_MANAGER'].includes(r));
  if (!isHR) {
    const callerEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!callerEmp || callerEmp.id !== employeeId) {
      return apiError(c, 'FORBIDDEN', 'Access to exit checklist is restricted to HR and self.', 403);
    }
  }

  try {
    const checklists = await HrService.getExitChecklist(db, tenantId, employeeId);
    return apiSuccess(c, checklists, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// B. EMPLOYEE DOCUMENT METADATA
// ==========================================

hrController.get('/employees/:employeeId/documents', requirePermission('hr:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  const isHR = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'HR_MANAGER'].includes(r));
  if (!isHR) {
    const callerEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!callerEmp || callerEmp.id !== employeeId) {
      return apiError(c, 'FORBIDDEN', 'Access to employee documents is restricted to HR and self.', 403);
    }
  }

  try {
    const docs = await HrService.getDocuments(db, tenantId, employeeId);
    return apiSuccess(c, docs, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/employees/:employeeId/documents', requirePermission('hr:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createDocumentMetadataSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid document metadata.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  try {
    const doc = await HrService.createDocument(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, doc, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/documents/:id', requirePermission('hr:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateDocumentMetadataSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid document update data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);

  try {
    const updated = await HrService.updateDocument(db, tenantId, id, parseResult.data, user.id, actingEmp?.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.delete('/documents/:id', requirePermission('hr:manage'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    await HrService.deleteDocument(db, tenantId, id, user.id);
    return apiSuccess(c, { message: 'Document metadata deleted successfully.' }, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// C. ATTENDANCE & REGULARIZATION
// ==========================================

hrController.get('/attendance', requirePermission('attendance:read'), async (c) => {
  const queryResult = listAttendanceQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid query parameters.', 400, queryResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const query = queryResult.data;

  // Non-admins without attendance:manage restricted to own employee attendance
  const isManager = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'].includes(r));
  if (!isManager && !query.employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (emp) query.employeeId = emp.id;
  }

  try {
    const result = await HrService.listAttendance(db, tenantId, query);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/attendance/:id', requirePermission('attendance:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const id = c.req.param('id');

  try {
    const record = await HrService.getAttendanceById(db, tenantId, id);
    return apiSuccess(c, record, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/attendance/punch-in', requirePermission('attendance:punch'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = punchInSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid punch-in request.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';

  let employeeId = parseResult.data.employeeId;
  if (!employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!emp) {
      return apiError(c, 'EMPLOYEE_PROFILE_REQUIRED', 'Authenticated user does not have a linked employee profile.', 400);
    }
    employeeId = emp.id;
  }

  try {
    const record = await HrService.punchIn(db, tenantId, employeeId, parseResult.data, ipAddress);
    return apiSuccess(c, record, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/attendance/punch-out', requirePermission('attendance:punch'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = punchOutSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid punch-out request.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';

  let employeeId = parseResult.data.employeeId;
  if (!employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!emp) {
      return apiError(c, 'EMPLOYEE_PROFILE_REQUIRED', 'Authenticated user does not have a linked employee profile.', 400);
    }
    employeeId = emp.id;
  }

  try {
    const record = await HrService.punchOut(db, tenantId, employeeId, parseResult.data, ipAddress);
    return apiSuccess(c, record, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/attendance/regularizations', requirePermission('attendance:regularize'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createRegularizationSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid regularization request.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  let employeeId = parseResult.data.employeeId;
  if (!employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!emp) {
      return apiError(c, 'EMPLOYEE_PROFILE_REQUIRED', 'Employee profile required for regularization.', 400);
    }
    employeeId = emp.id;
  }

  try {
    const reg = await HrService.createRegularization(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, reg, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/attendance/regularizations', requirePermission('attendance:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const isManager = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'].includes(r));
  const filterEmpId = c.req.query('employeeId');

  let targetEmpId = filterEmpId;
  if (!isManager && !filterEmpId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (emp) targetEmpId = emp.id;
  }

  try {
    const items = await HrService.listRegularizations(db, tenantId, targetEmpId);
    return apiSuccess(c, items, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/attendance/regularizations/:id', requirePermission('attendance:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateRegularizationSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid review payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
  const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');

  try {
    const updated = await HrService.updateRegularization(db, tenantId, id, parseResult.data, user.id, actingEmp?.id, isSuperAdmin);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// D. LEAVE MANAGEMENT
// ==========================================

hrController.get('/leave/types', requirePermission('leave:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const types = await HrService.listLeaveTypes(db, tenantId);
    return apiSuccess(c, types, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/types', requirePermission('leave:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createLeaveTypeSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid leave type data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createLeaveType(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/leave/types/:id', requirePermission('leave:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateLeaveTypeSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid leave type update.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    const updated = await HrService.updateLeaveType(db, tenantId, id, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/leave/allocations', requirePermission('leave:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const employeeId = c.req.query('employeeId');
  const year = c.req.query('year') ? parseInt(c.req.query('year')!, 10) : undefined;

  try {
    const allocs = await HrService.listLeaveAllocations(db, tenantId, employeeId, year);
    return apiSuccess(c, allocs, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/allocations', requirePermission('leave:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createLeaveAllocationSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid leave allocation payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createLeaveAllocation(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/leave/balances/:employeeId', requirePermission('leave:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');
  const year = c.req.query('year') ? parseInt(c.req.query('year')!, 10) : undefined;

  const isHR = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'BRANCH_MANAGER'].includes(r));
  if (!isHR) {
    const callerEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!callerEmp || callerEmp.id !== employeeId) {
      return apiError(c, 'FORBIDDEN', 'Access to employee leave balance is restricted to managers and self.', 403);
    }
  }

  try {
    const balances = await HrService.getLeaveBalances(db, tenantId, employeeId, year);
    return apiSuccess(c, balances, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/requests', requirePermission('leave:apply'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createLeaveRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid leave request data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  let employeeId = parseResult.data.employeeId;
  if (!employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!emp) {
      return apiError(c, 'EMPLOYEE_PROFILE_REQUIRED', 'Linked employee profile required to apply for leave.', 400);
    }
    employeeId = emp.id;
  }

  try {
    const req = await HrService.createLeaveRequest(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, req, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/leave/requests', requirePermission('leave:read'), async (c) => {
  const queryResult = listLeaveRequestsQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid query parameters.', 400, queryResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const query = queryResult.data;

  const isManager = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'].includes(r));
  if (!isManager && !query.employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (emp) query.employeeId = emp.id;
  }

  try {
    const result = await HrService.listLeaveRequests(db, tenantId, query);
    return apiSuccess(c, result, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/leave/requests/:id', requirePermission('leave:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const id = c.req.param('id');

  try {
    const req = await HrService.getLeaveRequestById(db, tenantId, id);
    return apiSuccess(c, req, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/requests/:id/approve', requirePermission('leave:approve'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = reviewLeaveRequestSchema.safeParse(body);
  const reviewNotes = parseResult.success ? parseResult.data.reviewNotes : undefined;

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
  const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');

  try {
    const approved = await HrService.approveLeaveRequest(db, tenantId, id, actingEmp ? actingEmp.id : user.id, reviewNotes || undefined, user.id, isSuperAdmin);
    return apiSuccess(c, approved, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/requests/:id/reject', requirePermission('leave:approve'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = reviewLeaveRequestSchema.safeParse(body);
  const reviewNotes = parseResult.success ? parseResult.data.reviewNotes : undefined;

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);

  try {
    const rejected = await HrService.rejectLeaveRequest(db, tenantId, id, actingEmp ? actingEmp.id : user.id, reviewNotes || undefined, user.id);
    return apiSuccess(c, rejected, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/leave/requests/:id/cancel', requirePermission('leave:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);

  try {
    const cancelled = await HrService.cancelLeaveRequest(db, tenantId, id, actingEmp?.id, user.id);
    return apiSuccess(c, cancelled, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// E. SHIFTS
// ==========================================

hrController.get('/shifts', requirePermission('shifts:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const items = await HrService.listShifts(db, tenantId);
    return apiSuccess(c, items, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/shifts', requirePermission('shifts:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createShiftSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid shift definition.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createShift(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/shifts/:id', requirePermission('shifts:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateShiftSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid shift update payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    const updated = await HrService.updateShift(db, tenantId, id, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/employees/:employeeId/shifts', requirePermission('shifts:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  const isHR = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'BRANCH_MANAGER'].includes(r));
  if (!isHR) {
    const callerEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (!callerEmp || callerEmp.id !== employeeId) {
      return apiError(c, 'FORBIDDEN', 'Access to employee shift schedules is restricted to managers and self.', 403);
    }
  }

  try {
    const assignments = await HrService.getEmployeeShifts(db, tenantId, employeeId);
    return apiSuccess(c, assignments, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/employees/:employeeId/shifts', requirePermission('shifts:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = assignShiftSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid shift assignment payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const employeeId = c.req.param('employeeId');

  try {
    const assigned = await HrService.assignShift(db, tenantId, employeeId, parseResult.data, user.id);
    return apiSuccess(c, assigned, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/employee-shifts/:id', requirePermission('shifts:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateEmployeeShiftSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid assignment update payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const id = c.req.param('id');

  try {
    const updated = await HrService.updateEmployeeShift(db, tenantId, id, parseResult.data);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// F. HOLIDAYS
// ==========================================

hrController.get('/holidays', requirePermission('holidays:read'), async (c) => {
  const queryResult = listHolidaysQuerySchema.safeParse(c.req.query());
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const query = queryResult.success ? queryResult.data : {};

  try {
    const items = await HrService.listHolidays(db, tenantId, query);
    return apiSuccess(c, items, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/holidays', requirePermission('holidays:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createHolidaySchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid holiday data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createHoliday(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/holidays/:id', requirePermission('holidays:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateHolidaySchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid holiday update data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    const updated = await HrService.updateHoliday(db, tenantId, id, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.delete('/holidays/:id', requirePermission('holidays:manage'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    await HrService.deleteHoliday(db, tenantId, id, user.id);
    return apiSuccess(c, { message: 'Holiday deleted successfully.' }, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// G. PERFORMANCE MANAGEMENT
// ==========================================

hrController.get('/performance/cycles', requirePermission('performance:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);

  try {
    const cycles = await HrService.listPerformanceCycles(db, tenantId);
    return apiSuccess(c, cycles, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/performance/cycles', requirePermission('performance:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createPerformanceCycleSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid performance cycle data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createPerformanceCycle(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/performance/cycles/:id', requirePermission('performance:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updatePerformanceCycleSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid cycle update data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    const updated = await HrService.updatePerformanceCycle(db, tenantId, id, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/performance/reviews', requirePermission('performance:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const query = c.req.query();

  const isManager = user.roles?.some((r: string) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'].includes(r));
  if (!isManager && !query.employeeId) {
    const emp = await HrService.getEmployeeForUser(db, tenantId, user.id);
    if (emp) (query as any).employeeId = emp.id;
  }

  try {
    const reviews = await HrService.listPerformanceReviews(db, tenantId, query);
    return apiSuccess(c, reviews, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/performance/reviews', requirePermission('performance:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createPerformanceReviewSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid performance review initiation.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;

  try {
    const created = await HrService.createPerformanceReview(db, tenantId, parseResult.data, user.id);
    return apiSuccess(c, created, 201);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/performance/reviews/:id', requirePermission('performance:read'), async (c) => {
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const id = c.req.param('id');

  try {
    const rev = await HrService.getPerformanceReviewById(db, tenantId, id);
    return apiSuccess(c, rev, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.patch('/performance/reviews/:id', requirePermission('performance:manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updatePerformanceReviewSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid review update payload.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');

  try {
    const updated = await HrService.updatePerformanceReview(db, tenantId, id, parseResult.data, user.id);
    return apiSuccess(c, updated, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.post('/performance/reviews/:id/submit', requirePermission(['performance:self', 'performance:manage']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = submitPerformanceReviewSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError(c, 'VALIDATION_ERROR', 'Invalid review submission data.', 400, parseResult.error.issues);
  }

  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const user = c.get('user')!;
  const id = c.req.param('id');
  const actingEmp = await HrService.getEmployeeForUser(db, tenantId, user.id);

  try {
    const submitted = await HrService.submitPerformanceReview(db, tenantId, id, parseResult.data, user.id, actingEmp?.id);
    return apiSuccess(c, submitted, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

// ==========================================
// H. HR REPORTS
// ==========================================

hrController.get('/reports/workforce', requirePermission('hr_reports:read'), async (c) => {
  const queryResult = reportQuerySchema.safeParse(c.req.query());
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const query = queryResult.success ? queryResult.data : {};

  try {
    const data = await HrService.getWorkforceSummary(db, tenantId, query);
    return apiSuccess(c, data, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/reports/attendance', requirePermission('hr_reports:read'), async (c) => {
  const queryResult = reportQuerySchema.safeParse(c.req.query());
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const query = queryResult.success ? queryResult.data : {};

  try {
    const data = await HrService.getAttendanceMetrics(db, tenantId, query);
    return apiSuccess(c, data, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/reports/leaves', requirePermission('hr_reports:read'), async (c) => {
  const queryResult = reportQuerySchema.safeParse(c.req.query());
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const query = queryResult.success ? queryResult.data : {};

  try {
    const data = await HrService.getLeaveMetrics(db, tenantId, query);
    return apiSuccess(c, data, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});

hrController.get('/reports/headcount', requirePermission('hr_reports:read'), async (c) => {
  const queryResult = reportQuerySchema.safeParse(c.req.query());
  const db = getDb(c);
  const { tenantId } = getTenantScope(c);
  const query = queryResult.success ? queryResult.data : {};

  try {
    const data = await HrService.getHeadcountDistribution(db, tenantId, query);
    return apiSuccess(c, data, 200);
  } catch (err: any) {
    if (err.code && err.status) return apiError(c, err.code, err.message, err.status);
    throw err;
  }
});
