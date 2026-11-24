import { eq, and, or, like, desc, asc, count, sql, inArray } from 'drizzle-orm';
import {
  type AppDatabase,
  projects,
  projectMembers,
  tasks,
  employees,
  departments,
  auditLogs,
  type ProjectStatus,
  type ProjectPriority,
  type ProjectRole,
} from '@sr-workspace/database';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsQuery,
  AddProjectMemberInput,
} from './projects.schemas';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export class ProjectsService {
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
        entityType: 'project',
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
   * List projects with search, status/priority/department/owner filters, and progress.
   */
  static async listProjects(
    db: AppDatabase,
    tenantId: string,
    query: ListProjectsQuery
  ) {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(projects.tenantId, tenantId)];

    if (query.status) {
      conditions.push(eq(projects.status, query.status));
    }
    if (query.priority) {
      conditions.push(eq(projects.priority, query.priority));
    }
    if (query.departmentId) {
      conditions.push(eq(projects.departmentId, query.departmentId));
    }
    if (query.ownerEmployeeId) {
      conditions.push(eq(projects.ownerEmployeeId, query.ownerEmployeeId));
    }
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(like(projects.name, term), like(projects.projectCode, term))!
      );
    }

    const whereClause = and(...conditions);

    const totalCountRes = await db
      .select({ total: count() })
      .from(projects)
      .where(whereClause);
    const total = totalCountRes[0]?.total ?? 0;

    let sortCol: any = projects.createdAt;
    if (query.sortBy === 'name') sortCol = projects.name;
    if (query.sortBy === 'projectCode') sortCol = projects.projectCode;
    if (query.sortBy === 'status') sortCol = projects.status;
    if (query.sortBy === 'priority') sortCol = projects.priority;
    if (query.sortBy === 'dueDate') sortCol = projects.dueDate;

    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const items = await db.query.projects.findMany({
      where: whereClause,
      limit: pageSize,
      offset,
      orderBy: [orderFn(sortCol)],
      with: {
        owner: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            workEmail: true,
          },
        },
        department: {
          columns: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Compute task counts and progress for each project
    const projectIds = items.map((p) => p.id);
    const statsMap = new Map<string, { totalTasks: number; completedTasks: number }>();

    if (projectIds.length > 0) {
      const taskCounts = await db
        .select({
          projectId: tasks.projectId,
          status: tasks.status,
          taskCount: count(),
        })
        .from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.projectId, projectIds)))
        .groupBy(tasks.projectId, tasks.status);

      for (const tc of taskCounts) {
        const existing = statsMap.get(tc.projectId) || { totalTasks: 0, completedTasks: 0 };
        existing.totalTasks += tc.taskCount;
        if (tc.status === 'COMPLETED') {
          existing.completedTasks += tc.taskCount;
        }
        statsMap.set(tc.projectId, existing);
      }
    }

    const projectsWithProgress = items.map((p) => {
      const stats = statsMap.get(p.id) || { totalTasks: 0, completedTasks: 0 };
      const progressPercentage =
        stats.totalTasks > 0
          ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
          : 0;

      return {
        ...p,
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        progressPercentage,
      };
    });

    return {
      items: projectsWithProgress,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get single project by ID with members, owner, department and task stats.
   */
  static async getProjectById(db: AppDatabase, tenantId: string, id: string) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.tenantId, tenantId)),
      with: {
        owner: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            workEmail: true,
          },
        },
        department: {
          columns: {
            id: true,
            name: true,
            code: true,
          },
        },
        members: {
          with: {
            employee: {
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
        },
      },
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    // Calculate task stats
    const taskCounts = await db
      .select({
        status: tasks.status,
        count: count(),
      })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.projectId, id)))
      .groupBy(tasks.status);

    let totalTasks = 0;
    let completedTasks = 0;
    const taskBreakdown: Record<string, number> = {};

    for (const tc of taskCounts) {
      totalTasks += tc.count;
      taskBreakdown[tc.status] = tc.count;
      if (tc.status === 'COMPLETED') completedTasks += tc.count;
    }

    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      ...project,
      totalTasks,
      completedTasks,
      progressPercentage,
      taskBreakdown,
    };
  }

  /**
   * Create a new project.
   */
  static async createProject(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    input: CreateProjectInput,
    meta?: RequestMeta
  ) {
    // 1. Verify project code uniqueness within tenant
    const existingCode = await db.query.projects.findFirst({
      where: and(
        eq(projects.tenantId, tenantId),
        eq(projects.projectCode, input.projectCode)
      ),
    });

    if (existingCode) {
      throw {
        code: 'PROJECT_CODE_EXISTS',
        message: `Project code '${input.projectCode}' is already in use within this workspace.`,
        status: 409,
      };
    }

    // 2. Verify owner employee belongs to same tenant
    const owner = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.ownerEmployeeId),
        eq(employees.tenantId, tenantId)
      ),
    });

    if (!owner) {
      throw {
        code: 'INVALID_PROJECT_OWNER',
        message: 'Project owner must be an active employee within this workspace.',
        status: 400,
      };
    }

    // 3. Verify department if provided
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
          message: 'Selected department does not exist in this workspace.',
          status: 400,
        };
      }
    }

    // 4. Validate date range
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;

    if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
      throw {
        code: 'INVALID_DATE_RANGE',
        message: 'Project due date cannot be earlier than start date.',
        status: 400,
      };
    }

    const projectId = crypto.randomUUID();
    const newProject = {
      id: projectId,
      tenantId,
      projectCode: input.projectCode,
      name: input.name,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      ownerEmployeeId: input.ownerEmployeeId,
      departmentId: input.departmentId || null,
      startDate,
      dueDate,
      completedAt: input.status === 'COMPLETED' ? new Date() : null,
      createdBy: userId,
      updatedBy: userId,
    };

    await db.insert(projects).values(newProject);

    // Automatically add project owner as PROJECT_MANAGER member
    await db.insert(projectMembers).values({
      id: crypto.randomUUID(),
      tenantId,
      projectId,
      employeeId: input.ownerEmployeeId,
      projectRole: 'PROJECT_MANAGER',
      addedBy: userId,
    });

    await this.audit(
      db,
      tenantId,
      userId,
      'CREATE',
      projectId,
      { projectCode: input.projectCode, name: input.name },
      meta
    );

    return this.getProjectById(db, tenantId, projectId);
  }

  /**
   * Update an existing project.
   */
  static async updateProject(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    input: UpdateProjectInput,
    meta?: RequestMeta
  ) {
    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    // Verify owner employee if updated
    if (input.ownerEmployeeId && input.ownerEmployeeId !== existing.ownerEmployeeId) {
      const owner = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.ownerEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!owner) {
        throw {
          code: 'INVALID_PROJECT_OWNER',
          message: 'Project owner must be an active employee within this workspace.',
          status: 400,
        };
      }
    }

    // Verify department if updated
    if (input.departmentId !== undefined && input.departmentId !== null) {
      const dept = await db.query.departments.findFirst({
        where: and(
          eq(departments.id, input.departmentId),
          eq(departments.tenantId, tenantId)
        ),
      });

      if (!dept) {
        throw {
          code: 'INVALID_DEPARTMENT',
          message: 'Selected department does not exist in this workspace.',
          status: 400,
        };
      }
    }

    // Validate dates
    const startDate =
      input.startDate !== undefined
        ? input.startDate ? new Date(input.startDate) : null
        : existing.startDate;
    const dueDate =
      input.dueDate !== undefined
        ? input.dueDate ? new Date(input.dueDate) : null
        : existing.dueDate;

    if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
      throw {
        code: 'INVALID_DATE_RANGE',
        message: 'Project due date cannot be earlier than start date.',
        status: 400,
      };
    }

    const completedAt =
      input.status === 'COMPLETED'
        ? existing.completedAt || new Date()
        : input.status
        ? null
        : existing.completedAt;

    const updates: Record<string, any> = {
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.ownerEmployeeId !== undefined) updates.ownerEmployeeId = input.ownerEmployeeId;
    if (input.departmentId !== undefined) updates.departmentId = input.departmentId;
    if (input.startDate !== undefined) updates.startDate = startDate;
    if (input.dueDate !== undefined) updates.dueDate = dueDate;
    updates.completedAt = completedAt;

    await db.update(projects).set(updates).where(eq(projects.id, id));

    await this.audit(db, tenantId, userId, 'UPDATE', id, updates, meta);

    return this.getProjectById(db, tenantId, id);
  }

  /**
   * Update project status.
   */
  static async updateProjectStatus(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    status: ProjectStatus,
    meta?: RequestMeta
  ) {
    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    const completedAt = status === 'COMPLETED' ? new Date() : null;

    await db
      .update(projects)
      .set({
        status,
        completedAt,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    await this.audit(
      db,
      tenantId,
      userId,
      'UPDATE',
      id,
      { event: 'STATUS_CHANGED', oldStatus: existing.status, newStatus: status },
      meta
    );

    return this.getProjectById(db, tenantId, id);
  }

  /**
   * Update project priority.
   */
  static async updateProjectPriority(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    priority: ProjectPriority,
    meta?: RequestMeta
  ) {
    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    await db
      .update(projects)
      .set({
        priority,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    await this.audit(
      db,
      tenantId,
      userId,
      'UPDATE',
      id,
      { event: 'PRIORITY_CHANGED', oldPriority: existing.priority, newPriority: priority },
      meta
    );

    return this.getProjectById(db, tenantId, id);
  }

  /**
   * Delete project. Rejects if active (non-completed/cancelled) tasks exist.
   */
  static async deleteProject(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    meta?: RequestMeta
  ) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    // Check for active tasks
    const activeTasks = await db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, id),
          eq(tasks.tenantId, tenantId),
          or(
            eq(tasks.status, 'TODO'),
            eq(tasks.status, 'IN_PROGRESS'),
            eq(tasks.status, 'IN_REVIEW'),
            eq(tasks.status, 'BLOCKED'),
            eq(tasks.status, 'BACKLOG')
          )
        )
      );

    if ((activeTasks[0]?.count ?? 0) > 0) {
      throw {
        code: 'PROJECT_HAS_ACTIVE_TASKS',
        message:
          'Cannot delete project while active tasks are present. Complete or cancel tasks before deletion.',
        status: 400,
      };
    }

    await db.delete(projects).where(eq(projects.id, id));

    await this.audit(
      db,
      tenantId,
      userId,
      'DELETE',
      id,
      { projectCode: project.projectCode, name: project.name },
      meta
    );

    return { success: true, id };
  }

  /**
   * Get project members.
   */
  static async getProjectMembers(db: AppDatabase, tenantId: string, projectId: string) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    return db.query.projectMembers.findMany({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.tenantId, tenantId)
      ),
      with: {
        employee: {
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
  }

  /**
   * Add a project member.
   */
  static async addProjectMember(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    projectId: string,
    input: AddProjectMemberInput,
    meta?: RequestMeta
  ) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    // Verify employee belongs to tenant
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.employeeId),
        eq(employees.tenantId, tenantId)
      ),
    });

    if (!employee) {
      throw {
        code: 'INVALID_EMPLOYEE',
        message: 'Employee does not exist in this workspace.',
        status: 400,
      };
    }

    // Check duplicate membership
    const existingMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.employeeId, input.employeeId)
      ),
    });

    if (existingMember) {
      throw {
        code: 'MEMBER_ALREADY_EXISTS',
        message: 'Employee is already a member of this project.',
        status: 409,
      };
    }

    const memberId = crypto.randomUUID();
    await db.insert(projectMembers).values({
      id: memberId,
      tenantId,
      projectId,
      employeeId: input.employeeId,
      projectRole: input.projectRole,
      addedBy: userId,
    });

    await this.audit(
      db,
      tenantId,
      userId,
      'UPDATE',
      projectId,
      { event: 'MEMBER_ADDED', employeeId: input.employeeId, role: input.projectRole },
      meta
    );

    return this.getProjectMembers(db, tenantId, projectId);
  }

  /**
   * Remove a project member. Cannot remove project owner.
   */
  static async removeProjectMember(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    projectId: string,
    employeeId: string,
    meta?: RequestMeta
  ) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    if (project.ownerEmployeeId === employeeId) {
      throw {
        code: 'CANNOT_REMOVE_PROJECT_OWNER',
        message: 'The project owner cannot be removed from project membership.',
        status: 400,
      };
    }

    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.employeeId, employeeId),
        eq(projectMembers.tenantId, tenantId)
      ),
    });

    if (!membership) {
      throw {
        code: 'MEMBER_NOT_FOUND',
        message: 'Employee is not a member of this project.',
        status: 404,
      };
    }

    await db.delete(projectMembers).where(eq(projectMembers.id, membership.id));

    await this.audit(
      db,
      tenantId,
      userId,
      'UPDATE',
      projectId,
      { event: 'MEMBER_REMOVED', employeeId },
      meta
    );

    return { success: true, removedEmployeeId: employeeId };
  }

  /**
   * Get all tasks belonging to a project.
   */
  static async getProjectTasks(db: AppDatabase, tenantId: string, projectId: string) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    return db.query.tasks.findMany({
      where: and(eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId)),
      orderBy: [asc(tasks.position), desc(tasks.createdAt)],
      with: {
        assignee: {
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
  }

  /**
   * Get project statistics (completion %, task breakdown by status/priority).
   */
  static async getProjectStatistics(db: AppDatabase, tenantId: string, projectId: string) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found within this workspace.',
        status: 404,
      };
    }

    const statusCounts = await db
      .select({
        status: tasks.status,
        count: count(),
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId)))
      .groupBy(tasks.status);

    const priorityCounts = await db
      .select({
        priority: tasks.priority,
        count: count(),
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId)))
      .groupBy(tasks.priority);

    let totalTasks = 0;
    let completedTasks = 0;
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const sc of statusCounts) {
      totalTasks += sc.count;
      byStatus[sc.status] = sc.count;
      if (sc.status === 'COMPLETED') completedTasks += sc.count;
    }

    for (const pc of priorityCounts) {
      byPriority[pc.priority] = pc.count;
    }

    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      projectId,
      totalTasks,
      completedTasks,
      progressPercentage,
      byStatus,
      byPriority,
    };
  }
}
