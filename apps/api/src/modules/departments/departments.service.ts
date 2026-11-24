import { eq, and, or, like, desc, asc, count, sql } from 'drizzle-orm';
import {
  type AppDatabase,
  departments,
  employees,
  auditLogs,
} from '@sr-workspace/database';
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  ListDepartmentsQuery,
} from './departments.schemas';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export class DepartmentsService {
  /**
   * List departments with search, status filtering, pagination, and employee count.
   */
  static async listDepartments(
    db: AppDatabase,
    tenantId: string,
    query: ListDepartmentsQuery
  ) {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(departments.tenantId, tenantId)];

    if (query.status) {
      conditions.push(eq(departments.status, query.status));
    }

    if (query.search) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(like(departments.name, term), like(departments.code, term))!
      );
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalCountRes = await db
      .select({ total: count() })
      .from(departments)
      .where(whereClause);
    const total = totalCountRes[0]?.total ?? 0;

    // Sorting
    const sortField =
      query.sortBy === 'code'
        ? departments.code
        : query.sortBy === 'createdAt'
        ? departments.createdAt
        : query.sortBy === 'status'
        ? departments.status
        : departments.name;

    const orderFn = query.sortOrder === 'desc' ? desc : asc;

    // Fetch items with department head relation
    const items = await db.query.departments.findMany({
      where: whereClause,
      limit: pageSize,
      offset,
      orderBy: [orderFn(sortField)],
      with: {
        departmentHead: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            workEmail: true,
          },
        },
      },
    });

    // Populate employee count per department
    const itemsWithCount = await Promise.all(
      items.map(async (dept) => {
        const empCountRes = await db
          .select({ count: count() })
          .from(employees)
          .where(
            and(
              eq(employees.departmentId, dept.id),
              eq(employees.tenantId, tenantId)
            )
          );

        return {
          ...dept,
          employeeCount: empCountRes[0]?.count ?? 0,
        };
      })
    );

    return {
      items: itemsWithCount,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get single department by ID with head info and employee count.
   */
  static async getDepartmentById(db: AppDatabase, tenantId: string, id: string) {
    const dept = await db.query.departments.findFirst({
      where: and(eq(departments.id, id), eq(departments.tenantId, tenantId)),
      with: {
        departmentHead: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            workEmail: true,
          },
        },
      },
    });

    if (!dept) {
      throw {
        code: 'DEPARTMENT_NOT_FOUND',
        message: 'Department not found within this workspace.',
        status: 404,
      };
    }

    const empCountRes = await db
      .select({ count: count() })
      .from(employees)
      .where(
        and(
          eq(employees.departmentId, dept.id),
          eq(employees.tenantId, tenantId)
        )
      );

    return {
      ...dept,
      employeeCount: empCountRes[0]?.count ?? 0,
    };
  }

  /**
   * Create a new department with unique code validation and tenant head verification.
   */
  static async createDepartment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    input: CreateDepartmentInput,
    meta?: RequestMeta
  ) {
    const existingCode = await db.query.departments.findFirst({
      where: and(
        eq(departments.tenantId, tenantId),
        eq(departments.code, input.code.toUpperCase())
      ),
    });

    if (existingCode) {
      throw {
        code: 'DEPARTMENT_CODE_EXISTS',
        message: `Department code '${input.code}' is already in use within this workspace.`,
        status: 409,
      };
    }

    // Verify department head belongs to same tenant if provided
    if (input.departmentHeadId) {
      const head = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.departmentHeadId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!head) {
        throw {
          code: 'INVALID_DEPARTMENT_HEAD',
          message: 'The selected department head does not exist in this workspace.',
          status: 400,
        };
      }
    }

    const deptId = crypto.randomUUID();
    const newDept = {
      id: deptId,
      tenantId,
      organisationId: input.organisationId || null,
      name: input.name,
      code: input.code.toUpperCase(),
      description: input.description || null,
      departmentHeadId: input.departmentHeadId || null,
      status: input.status || 'ACTIVE',
      createdBy: userId,
      updatedBy: userId,
    };

    await db.insert(departments).values(newDept);

    // Record audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'department',
      entityId: deptId,
      changes: JSON.stringify({ name: input.name, code: input.code }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getDepartmentById(db, tenantId, deptId);
  }

  /**
   * Update an existing department.
   */
  static async updateDepartment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    input: UpdateDepartmentInput,
    meta?: RequestMeta
  ) {
    const existing = await db.query.departments.findFirst({
      where: and(eq(departments.id, id), eq(departments.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'DEPARTMENT_NOT_FOUND',
        message: 'Department not found within this workspace.',
        status: 404,
      };
    }

    // Check code uniqueness if code changed
    if (input.code && input.code.toUpperCase() !== existing.code) {
      const duplicate = await db.query.departments.findFirst({
        where: and(
          eq(departments.tenantId, tenantId),
          eq(departments.code, input.code.toUpperCase())
        ),
      });

      if (duplicate && duplicate.id !== id) {
        throw {
          code: 'DEPARTMENT_CODE_EXISTS',
          message: `Department code '${input.code}' is already in use.`,
          status: 409,
        };
      }
    }

    // Validate department head if changed
    if (input.departmentHeadId) {
      const head = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.departmentHeadId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!head) {
        throw {
          code: 'INVALID_DEPARTMENT_HEAD',
          message: 'The selected department head does not exist in this workspace.',
          status: 400,
        };
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.code !== undefined) updates.code = input.code.toUpperCase();
    if (input.description !== undefined) updates.description = input.description;
    if (input.departmentHeadId !== undefined) updates.departmentHeadId = input.departmentHeadId;
    if (input.organisationId !== undefined) updates.organisationId = input.organisationId;
    if (input.status !== undefined) updates.status = input.status;

    await db.update(departments).set(updates).where(eq(departments.id, id));

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'department',
      entityId: id,
      changes: JSON.stringify(updates),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getDepartmentById(db, tenantId, id);
  }

  /**
   * Update department status (ACTIVE / INACTIVE).
   */
  static async updateDepartmentStatus(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
    meta?: RequestMeta
  ) {
    return this.updateDepartment(db, tenantId, userId, id, { status }, meta);
  }

  /**
   * Delete or archive department.
   * STRICT SAFETY: Prevents deletion if employees are currently assigned to the department!
   */
  static async deleteDepartment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    meta?: RequestMeta
  ) {
    const dept = await db.query.departments.findFirst({
      where: and(eq(departments.id, id), eq(departments.tenantId, tenantId)),
    });

    if (!dept) {
      throw {
        code: 'DEPARTMENT_NOT_FOUND',
        message: 'Department not found within this workspace.',
        status: 404,
      };
    }

    // Check if any employees are assigned to this department
    const empCountRes = await db
      .select({ count: count() })
      .from(employees)
      .where(
        and(
          eq(employees.departmentId, id),
          eq(employees.tenantId, tenantId)
        )
      );

    const assignedCount = empCountRes[0]?.count ?? 0;
    if (assignedCount > 0) {
      throw {
        code: 'DEPARTMENT_HAS_EMPLOYEES',
        message: `Cannot delete department '${dept.name}': There are ${assignedCount} active employee(s) assigned to this department. Please reassign them before deletion.`,
        status: 400,
      };
    }

    await db.delete(departments).where(eq(departments.id, id));

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'DELETE',
      entityType: 'department',
      entityId: id,
      changes: JSON.stringify({ name: dept.name, code: dept.code }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return { message: `Department '${dept.name}' was successfully removed.` };
  }
}
