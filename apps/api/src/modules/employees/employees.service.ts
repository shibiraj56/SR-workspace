import { eq, and, or, like, desc, asc, count } from 'drizzle-orm';
import {
  type AppDatabase,
  employees,
  departments,
  userTenants,
  auditLogs,
} from '@sr-workspace/database';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  ListEmployeesQuery,
  employmentStatusEnum,
} from './employees.schemas';
import type { z } from 'zod';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export class EmployeesService {
  /**
   * List employees with search, department/status/type filters, pagination, and sorting.
   */
  static async listEmployees(
    db: AppDatabase,
    tenantId: string,
    query: ListEmployeesQuery
  ) {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(employees.tenantId, tenantId)];

    if (query.departmentId) {
      conditions.push(eq(employees.departmentId, query.departmentId));
    }

    if (query.employmentStatus) {
      conditions.push(eq(employees.employmentStatus, query.employmentStatus));
    }

    if (query.employmentType) {
      conditions.push(eq(employees.employmentType, query.employmentType));
    }

    if (query.search) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          like(employees.firstName, term),
          like(employees.lastName, term),
          like(employees.employeeCode, term),
          like(employees.workEmail, term)
        )!
      );
    }

    const whereClause = and(...conditions);

    // Total count query
    const totalCountRes = await db
      .select({ total: count() })
      .from(employees)
      .where(whereClause);
    const total = totalCountRes[0]?.total ?? 0;

    // Sort column mapping
    const sortField =
      query.sortBy === 'lastName'
        ? employees.lastName
        : query.sortBy === 'employeeCode'
        ? employees.employeeCode
        : query.sortBy === 'joiningDate'
        ? employees.joiningDate
        : query.sortBy === 'createdAt'
        ? employees.createdAt
        : employees.firstName;

    const orderFn = query.sortOrder === 'desc' ? desc : asc;

    const items = await db.query.employees.findMany({
      where: whereClause,
      limit: pageSize,
      offset,
      orderBy: [orderFn(sortField)],
      with: {
        department: {
          columns: {
            id: true,
            name: true,
            code: true,
          },
        },
        manager: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        user: {
          columns: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get single employee by ID.
   */
  static async getEmployeeById(db: AppDatabase, tenantId: string, id: string) {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), eq(employees.tenantId, tenantId)),
      with: {
        department: {
          columns: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
        manager: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            workEmail: true,
          },
        },
        user: {
          columns: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!emp) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee record not found within this workspace.',
        status: 404,
      };
    }

    return emp;
  }

  /**
   * Create an employee with strict tenant isolation on code, department, manager, and user.
   */
  static async createEmployee(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    input: CreateEmployeeInput,
    meta?: RequestMeta
  ) {
    // 1. Verify employee code uniqueness within this tenant
    const duplicateCode = await db.query.employees.findFirst({
      where: and(
        eq(employees.tenantId, tenantId),
        eq(employees.employeeCode, input.employeeCode.toUpperCase())
      ),
    });

    if (duplicateCode) {
      throw {
        code: 'EMPLOYEE_CODE_EXISTS',
        message: `Employee code '${input.employeeCode}' already exists in this workspace.`,
        status: 409,
      };
    }

    // 2. Validate department belongs to same tenant
    if (input.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: and(
          eq(departments.id, input.departmentId),
          eq(departments.tenantId, tenantId)
        ),
      });

      if (!dept) {
        throw {
          code: 'INVALID_DEPARTMENT',
          message: 'The selected department does not exist in this workspace.',
          status: 400,
        };
      }
    }

    // 3. Validate manager belongs to same tenant
    if (input.managerEmployeeId) {
      const mgr = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.managerEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!mgr) {
        throw {
          code: 'INVALID_MANAGER',
          message: 'Reporting manager must be an employee within the same workspace.',
          status: 400,
        };
      }
    }

    // 4. Validate linked user belongs to same tenant if supplied
    if (input.userId) {
      const userMembership = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, input.userId),
          eq(userTenants.tenantId, tenantId)
        ),
      });

      if (!userMembership) {
        throw {
          code: 'INVALID_LINKED_USER',
          message: 'The linked user account is not a member of this workspace.',
          status: 400,
        };
      }
    }

    const employeeId = crypto.randomUUID();
    const newRecord = {
      id: employeeId,
      tenantId,
      organisationId: input.organisationId || null,
      branchId: input.branchId || null,
      employeeCode: input.employeeCode.toUpperCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      workEmail: input.workEmail ? input.workEmail.toLowerCase() : null,
      personalEmail: input.personalEmail ? input.personalEmail.toLowerCase() : null,
      phone: input.phone || null,
      jobTitle: input.jobTitle || null,
      departmentId: input.departmentId || null,
      managerEmployeeId: input.managerEmployeeId || null,
      userId: input.userId || null,
      employmentType: input.employmentType || 'FULL_TIME',
      joiningDate: input.joiningDate,
      employmentStatus: input.employmentStatus || 'ACTIVE',
      profileImageUrl: input.profileImageUrl || null,
      notes: input.notes || null,
      createdBy: userId,
      updatedBy: userId,
    };

    await db.insert(employees).values(newRecord);

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'employee',
      entityId: employeeId,
      changes: JSON.stringify({
        employeeCode: input.employeeCode,
        name: `${input.firstName} ${input.lastName}`,
        departmentId: input.departmentId,
      }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getEmployeeById(db, tenantId, employeeId);
  }

  /**
   * Update an employee with conflict prevention and hierarchy checks.
   */
  static async updateEmployee(
    db: AppDatabase,
    tenantId: string,
    currentUserId: string,
    id: string,
    input: UpdateEmployeeInput,
    meta?: RequestMeta
  ) {
    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), eq(employees.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee record not found within this workspace.',
        status: 404,
      };
    }

    // Check code uniqueness if changed
    if (input.employeeCode && input.employeeCode.toUpperCase() !== existing.employeeCode) {
      const duplicate = await db.query.employees.findFirst({
        where: and(
          eq(employees.tenantId, tenantId),
          eq(employees.employeeCode, input.employeeCode.toUpperCase())
        ),
      });

      if (duplicate && duplicate.id !== id) {
        throw {
          code: 'EMPLOYEE_CODE_EXISTS',
          message: `Employee code '${input.employeeCode}' already exists in this workspace.`,
          status: 409,
        };
      }
    }

    // Check manager hierarchy: An employee cannot manage themselves!
    if (input.managerEmployeeId) {
      if (input.managerEmployeeId === id) {
        throw {
          code: 'INVALID_MANAGER_HIERARCHY',
          message: 'An employee cannot be assigned as their own manager.',
          status: 400,
        };
      }

      const mgr = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.managerEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!mgr) {
        throw {
          code: 'INVALID_MANAGER',
          message: 'Reporting manager must be an employee within the same workspace.',
          status: 400,
        };
      }
    }

    // Check department if changed
    if (input.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: and(
          eq(departments.id, input.departmentId),
          eq(departments.tenantId, tenantId)
        ),
      });

      if (!dept) {
        throw {
          code: 'INVALID_DEPARTMENT',
          message: 'The selected department does not exist in this workspace.',
          status: 400,
        };
      }
    }

    // Check linked user if changed
    if (input.userId) {
      const userMembership = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, input.userId),
          eq(userTenants.tenantId, tenantId)
        ),
      });

      if (!userMembership) {
        throw {
          code: 'INVALID_LINKED_USER',
          message: 'The linked user account is not a member of this workspace.',
          status: 400,
        };
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
      updatedBy: currentUserId,
    };

    if (input.employeeCode !== undefined) updates.employeeCode = input.employeeCode.toUpperCase();
    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.workEmail !== undefined) updates.workEmail = input.workEmail ? input.workEmail.toLowerCase() : null;
    if (input.personalEmail !== undefined) updates.personalEmail = input.personalEmail ? input.personalEmail.toLowerCase() : null;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.jobTitle !== undefined) updates.jobTitle = input.jobTitle;
    if (input.departmentId !== undefined) updates.departmentId = input.departmentId;
    if (input.managerEmployeeId !== undefined) updates.managerEmployeeId = input.managerEmployeeId;
    if (input.userId !== undefined) updates.userId = input.userId;
    if (input.organisationId !== undefined) updates.organisationId = input.organisationId;
    if (input.branchId !== undefined) updates.branchId = input.branchId;
    if (input.employmentType !== undefined) updates.employmentType = input.employmentType;
    if (input.employmentStatus !== undefined) updates.employmentStatus = input.employmentStatus;
    if (input.joiningDate !== undefined) updates.joiningDate = input.joiningDate;
    if (input.profileImageUrl !== undefined) updates.profileImageUrl = input.profileImageUrl;
    if (input.notes !== undefined) updates.notes = input.notes;

    await db.update(employees).set(updates).where(eq(employees.id, id));

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId: currentUserId,
      action: 'UPDATE',
      entityType: 'employee',
      entityId: id,
      changes: JSON.stringify(updates),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getEmployeeById(db, tenantId, id);
  }

  /**
   * Update employment status (ACTIVE, INACTIVE, ON_LEAVE, TERMINATED).
   */
  static async updateEmployeeStatus(
    db: AppDatabase,
    tenantId: string,
    currentUserId: string,
    id: string,
    status: z.infer<typeof employmentStatusEnum>,
    meta?: RequestMeta
  ) {
    return this.updateEmployee(db, tenantId, currentUserId, id, { employmentStatus: status }, meta);
  }

  /**
   * Deactivate or archive employee.
   */
  static async deleteEmployee(
    db: AppDatabase,
    tenantId: string,
    currentUserId: string,
    id: string,
    meta?: RequestMeta
  ) {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), eq(employees.tenantId, tenantId)),
    });

    if (!emp) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee record not found within this workspace.',
        status: 404,
      };
    }

    // If this employee is department head of any departments in this tenant, reset head to null
    await db
      .update(departments)
      .set({ departmentHeadId: null, updatedAt: new Date() })
      .where(and(eq(departments.departmentHeadId, id), eq(departments.tenantId, tenantId)));

    // If any employees report to this employee, reset their manager to null
    await db
      .update(employees)
      .set({ managerEmployeeId: null, updatedAt: new Date() })
      .where(and(eq(employees.managerEmployeeId, id), eq(employees.tenantId, tenantId)));

    await db.delete(employees).where(eq(employees.id, id));

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId: currentUserId,
      action: 'DELETE',
      entityType: 'employee',
      entityId: id,
      changes: JSON.stringify({
        employeeCode: emp.employeeCode,
        name: `${emp.firstName} ${emp.lastName}`,
      }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return { message: `Employee '${emp.firstName} ${emp.lastName}' was successfully removed.` };
  }
}
