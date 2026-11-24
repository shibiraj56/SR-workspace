import { eq, and, or, like, desc, asc, count, sql, lt, ne } from 'drizzle-orm';
import {
  type AppDatabase,
  tasks,
  projects,
  projectMembers,
  employees,
  users,
  taskComments,
  taskActivity,
  auditLogs,
  type TaskStatus,
  type TaskPriority,
} from '@sr-workspace/database';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksQuery,
} from './tasks.schemas';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export class TasksService {
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
        entityType: 'task',
        entityId,
        changes: JSON.stringify(changes),
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    } catch {
      // non-critical audit log failure
    }
  }

  /**
   * Helper to write task activity log.
   */
  private static async recordActivity(
    db: AppDatabase,
    tenantId: string,
    taskId: string,
    actorUserId: string | undefined,
    action: string,
    oldValue?: string | null,
    newValue?: string | null
  ) {
    try {
      await db.insert(taskActivity).values({
        tenantId,
        taskId,
        actorUserId: actorUserId || null,
        action,
        oldValue: oldValue || null,
        newValue: newValue || null,
      });
    } catch {
      // non-critical activity logging failure
    }
  }

  /**
   * List tasks with filters (project, status, priority, assignee, reporter, overdue, search).
   */
  static async listTasks(db: AppDatabase, tenantId: string, query: ListTasksQuery) {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(tasks.tenantId, tenantId)];

    if (query.projectId) {
      conditions.push(eq(tasks.projectId, query.projectId));
    }
    if (query.status) {
      conditions.push(eq(tasks.status, query.status));
    }
    if (query.priority) {
      conditions.push(eq(tasks.priority, query.priority));
    }
    if (query.assigneeEmployeeId) {
      conditions.push(eq(tasks.assigneeEmployeeId, query.assigneeEmployeeId));
    }
    if (query.reporterEmployeeId) {
      conditions.push(eq(tasks.reporterEmployeeId, query.reporterEmployeeId));
    }
    if (query.parentTaskId !== undefined) {
      if (query.parentTaskId === null) {
        conditions.push(sql`${tasks.parentTaskId} IS NULL`);
      } else {
        conditions.push(eq(tasks.parentTaskId, query.parentTaskId));
      }
    }
    if (query.overdue) {
      const now = new Date();
      conditions.push(
        and(
          lt(tasks.dueDate, now),
          ne(tasks.status, 'COMPLETED'),
          ne(tasks.status, 'CANCELLED')
        )!
      );
    }
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      conditions.push(or(like(tasks.title, term), like(tasks.taskCode, term))!);
    }

    const whereClause = and(...conditions);

    const totalCountRes = await db
      .select({ total: count() })
      .from(tasks)
      .where(whereClause);
    const total = totalCountRes[0]?.total ?? 0;

    let sortCol: any = tasks.createdAt;
    if (query.sortBy === 'title') sortCol = tasks.title;
    if (query.sortBy === 'taskCode') sortCol = tasks.taskCode;
    if (query.sortBy === 'status') sortCol = tasks.status;
    if (query.sortBy === 'priority') sortCol = tasks.priority;
    if (query.sortBy === 'dueDate') sortCol = tasks.dueDate;
    if (query.sortBy === 'position') sortCol = tasks.position;

    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const items = await db.query.tasks.findMany({
      where: whereClause,
      limit: pageSize,
      offset,
      orderBy: [orderFn(sortCol)],
      with: {
        project: {
          columns: {
            id: true,
            projectCode: true,
            name: true,
            status: true,
          },
        },
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
        reporter: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
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
   * Get single task with comments and activity history.
   */
  static async getTaskById(db: AppDatabase, tenantId: string, id: string) {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
      with: {
        project: {
          columns: {
            id: true,
            projectCode: true,
            name: true,
            status: true,
          },
        },
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
        reporter: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        parentTask: {
          columns: {
            id: true,
            taskCode: true,
            title: true,
            status: true,
          },
        },
        subtasks: {
          columns: {
            id: true,
            taskCode: true,
            title: true,
            status: true,
            priority: true,
          },
        },
        comments: {
          orderBy: [desc(taskComments.createdAt)],
          with: {
            author: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        activity: {
          orderBy: [desc(taskActivity.createdAt)],
          limit: 30,
          with: {
            actor: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    return task;
  }

  /**
   * Create a new task.
   */
  static async createTask(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    input: CreateTaskInput,
    meta?: RequestMeta
  ) {
    // 1. Verify project exists in tenant
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.tenantId, tenantId)),
    });

    if (!project) {
      throw {
        code: 'PROJECT_NOT_FOUND',
        message: 'Target project does not exist in this workspace.',
        status: 404,
      };
    }

    // Cancelled projects do not accept new tasks
    if (project.status === 'CANCELLED') {
      throw {
        code: 'PROJECT_CANCELLED',
        message: 'Cannot create tasks under a cancelled project. Reopen the project first.',
        status: 400,
      };
    }

    // 2. Verify task code uniqueness within tenant
    const existingCode = await db.query.tasks.findFirst({
      where: and(eq(tasks.tenantId, tenantId), eq(tasks.taskCode, input.taskCode)),
    });

    if (existingCode) {
      throw {
        code: 'TASK_CODE_EXISTS',
        message: `Task code '${input.taskCode}' is already in use within this workspace.`,
        status: 409,
      };
    }

    // 3. Verify assignee belongs to tenant AND is project member
    if (input.assigneeEmployeeId) {
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.assigneeEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!employee) {
        throw {
          code: 'INVALID_ASSIGNEE',
          message: 'Assignee employee does not exist in this workspace.',
          status: 400,
        };
      }

      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, input.projectId),
          eq(projectMembers.employeeId, input.assigneeEmployeeId),
          eq(projectMembers.tenantId, tenantId)
        ),
      });

      if (!membership) {
        throw {
          code: 'ASSIGNEE_NOT_PROJECT_MEMBER',
          message: 'The selected assignee is not an active member of this project.',
          status: 400,
        };
      }
    }

    // 4. Verify reporter if provided
    if (input.reporterEmployeeId) {
      const reporter = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.reporterEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!reporter) {
        throw {
          code: 'INVALID_REPORTER',
          message: 'Reporter employee does not exist in this workspace.',
          status: 400,
        };
      }
    }

    // 5. Verify parent task if provided
    if (input.parentTaskId) {
      const parent = await db.query.tasks.findFirst({
        where: and(
          eq(tasks.id, input.parentTaskId),
          eq(tasks.projectId, input.projectId),
          eq(tasks.tenantId, tenantId)
        ),
      });

      if (!parent) {
        throw {
          code: 'INVALID_PARENT_TASK',
          message: 'Parent task not found in the same project.',
          status: 400,
        };
      }
    }

    // 6. Validate dates
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;

    if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
      throw {
        code: 'INVALID_DATE_RANGE',
        message: 'Task due date cannot be earlier than start date.',
        status: 400,
      };
    }

    const taskId = crypto.randomUUID();
    const completedAt = input.status === 'COMPLETED' ? new Date() : null;

    const newTask = {
      id: taskId,
      tenantId,
      projectId: input.projectId,
      taskCode: input.taskCode,
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      assigneeEmployeeId: input.assigneeEmployeeId || null,
      reporterEmployeeId: input.reporterEmployeeId || null,
      parentTaskId: input.parentTaskId || null,
      startDate,
      dueDate,
      completedAt,
      position: input.position,
      createdBy: userId,
      updatedBy: userId,
    };

    await db.insert(tasks).values(newTask);

    await this.recordActivity(db, tenantId, taskId, userId, 'TASK_CREATED', null, input.title);

    await this.audit(
      db,
      tenantId,
      userId,
      'CREATE',
      taskId,
      { taskCode: input.taskCode, title: input.title, projectId: input.projectId },
      meta
    );

    return this.getTaskById(db, tenantId, taskId);
  }

  /**
   * Update an existing task.
   */
  static async updateTask(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    input: UpdateTaskInput,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    // Assignee validation
    if (input.assigneeEmployeeId && input.assigneeEmployeeId !== existing.assigneeEmployeeId) {
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.assigneeEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!employee) {
        throw {
          code: 'INVALID_ASSIGNEE',
          message: 'Assignee employee does not exist in this workspace.',
          status: 400,
        };
      }

      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, existing.projectId),
          eq(projectMembers.employeeId, input.assigneeEmployeeId),
          eq(projectMembers.tenantId, tenantId)
        ),
      });

      if (!membership) {
        throw {
          code: 'ASSIGNEE_NOT_PROJECT_MEMBER',
          message: 'The selected assignee is not an active member of this project.',
          status: 400,
        };
      }
    }

    // Parent task validation & circular hierarchy prevention
    if (input.parentTaskId !== undefined && input.parentTaskId !== null) {
      if (input.parentTaskId === id) {
        throw {
          code: 'INVALID_PARENT_TASK',
          message: 'A task cannot be its own parent.',
          status: 400,
        };
      }

      const parent = await db.query.tasks.findFirst({
        where: and(
          eq(tasks.id, input.parentTaskId),
          eq(tasks.projectId, existing.projectId),
          eq(tasks.tenantId, tenantId)
        ),
      });

      if (!parent) {
        throw {
          code: 'INVALID_PARENT_TASK',
          message: 'Parent task not found in the same project.',
          status: 400,
        };
      }
    }

    // Dates validation
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
        message: 'Task due date cannot be earlier than start date.',
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

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assigneeEmployeeId !== undefined) updates.assigneeEmployeeId = input.assigneeEmployeeId;
    if (input.reporterEmployeeId !== undefined) updates.reporterEmployeeId = input.reporterEmployeeId;
    if (input.parentTaskId !== undefined) updates.parentTaskId = input.parentTaskId;
    if (input.startDate !== undefined) updates.startDate = startDate;
    if (input.dueDate !== undefined) updates.dueDate = dueDate;
    if (input.position !== undefined) updates.position = input.position;
    updates.completedAt = completedAt;

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    // Log activity for status or priority changes
    if (input.status && input.status !== existing.status) {
      await this.recordActivity(db, tenantId, id, userId, 'STATUS_CHANGED', existing.status, input.status);
    }
    if (input.priority && input.priority !== existing.priority) {
      await this.recordActivity(db, tenantId, id, userId, 'PRIORITY_CHANGED', existing.priority, input.priority);
    }
    if (input.assigneeEmployeeId !== undefined && input.assigneeEmployeeId !== existing.assigneeEmployeeId) {
      await this.recordActivity(db, tenantId, id, userId, 'ASSIGNEE_CHANGED', existing.assigneeEmployeeId, input.assigneeEmployeeId);
    }

    await this.audit(db, tenantId, userId, 'UPDATE', id, updates, meta);

    return this.getTaskById(db, tenantId, id);
  }

  /**
   * Quick status change (e.g. Kanban column move).
   */
  static async updateTaskStatus(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    status: TaskStatus,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    const completedAt = status === 'COMPLETED' ? new Date() : null;

    await db
      .update(tasks)
      .set({
        status,
        completedAt,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    await this.recordActivity(db, tenantId, id, userId, 'STATUS_CHANGED', existing.status, status);
    await this.audit(db, tenantId, userId, 'UPDATE', id, { event: 'STATUS_CHANGED', oldStatus: existing.status, newStatus: status }, meta);

    return this.getTaskById(db, tenantId, id);
  }

  /**
   * Update task priority.
   */
  static async updateTaskPriority(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    priority: TaskPriority,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    await db
      .update(tasks)
      .set({
        priority,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    await this.recordActivity(db, tenantId, id, userId, 'PRIORITY_CHANGED', existing.priority, priority);
    await this.audit(db, tenantId, userId, 'UPDATE', id, { event: 'PRIORITY_CHANGED', oldPriority: existing.priority, newPriority: priority }, meta);

    return this.getTaskById(db, tenantId, id);
  }

  /**
   * Update task assignee.
   */
  static async updateTaskAssignee(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    assigneeEmployeeId: string | null,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    if (assigneeEmployeeId) {
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, assigneeEmployeeId),
          eq(employees.tenantId, tenantId)
        ),
      });

      if (!employee) {
        throw {
          code: 'INVALID_ASSIGNEE',
          message: 'Assignee employee does not exist in this workspace.',
          status: 400,
        };
      }

      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, existing.projectId),
          eq(projectMembers.employeeId, assigneeEmployeeId),
          eq(projectMembers.tenantId, tenantId)
        ),
      });

      if (!membership) {
        throw {
          code: 'ASSIGNEE_NOT_PROJECT_MEMBER',
          message: 'The selected assignee is not an active member of this project.',
          status: 400,
        };
      }
    }

    await db
      .update(tasks)
      .set({
        assigneeEmployeeId,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    await this.recordActivity(db, tenantId, id, userId, 'ASSIGNEE_CHANGED', existing.assigneeEmployeeId, assigneeEmployeeId);
    await this.audit(db, tenantId, userId, 'UPDATE', id, { event: 'ASSIGNEE_CHANGED', oldAssignee: existing.assigneeEmployeeId, newAssignee: assigneeEmployeeId }, meta);

    return this.getTaskById(db, tenantId, id);
  }

  /**
   * Update task position and optional status (Kanban drag-and-drop).
   */
  static async updateTaskPosition(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    position: number,
    status?: TaskStatus,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    const updates: Record<string, any> = {
      position,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (status && status !== existing.status) {
      updates.status = status;
      updates.completedAt = status === 'COMPLETED' ? new Date() : null;
      await this.recordActivity(db, tenantId, id, userId, 'STATUS_CHANGED', existing.status, status);
    }

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    return this.getTaskById(db, tenantId, id);
  }

  /**
   * Delete task.
   */
  static async deleteTask(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    id: string,
    meta?: RequestMeta
  ) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
    });

    if (!existing) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    // Clear parentTaskId on any subtasks
    await db
      .update(tasks)
      .set({ parentTaskId: null })
      .where(eq(tasks.parentTaskId, id));

    await db.delete(tasks).where(eq(tasks.id, id));

    await this.audit(db, tenantId, userId, 'DELETE', id, { taskCode: existing.taskCode, title: existing.title }, meta);

    return { success: true, id };
  }

  /**
   * Get comments on a task.
   */
  static async getTaskComments(db: AppDatabase, tenantId: string, taskId: string) {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)),
    });

    if (!task) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    return db.query.taskComments.findMany({
      where: and(eq(taskComments.taskId, taskId), eq(taskComments.tenantId, tenantId)),
      orderBy: [desc(taskComments.createdAt)],
      with: {
        author: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Add a comment to a task.
   */
  static async createTaskComment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    taskId: string,
    content: string
  ) {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)),
    });

    if (!task) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    const commentId = crypto.randomUUID();
    await db.insert(taskComments).values({
      id: commentId,
      tenantId,
      taskId,
      authorUserId: userId,
      content,
    });

    await this.recordActivity(db, tenantId, taskId, userId, 'COMMENT_ADDED', null, content.slice(0, 100));

    return db.query.taskComments.findFirst({
      where: eq(taskComments.id, commentId),
      with: {
        author: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Update a task comment (author or admin only).
   */
  static async updateTaskComment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    taskId: string,
    commentId: string,
    content: string
  ) {
    const comment = await db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
        eq(taskComments.tenantId, tenantId)
      ),
    });

    if (!comment) {
      throw {
        code: 'COMMENT_NOT_FOUND',
        message: 'Comment not found on this task.',
        status: 404,
      };
    }

    if (comment.authorUserId !== userId) {
      throw {
        code: 'FORBIDDEN_COMMENT_EDIT',
        message: 'You can only edit your own comments.',
        status: 403,
      };
    }

    await db
      .update(taskComments)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(eq(taskComments.id, commentId));

    return db.query.taskComments.findFirst({
      where: eq(taskComments.id, commentId),
      with: {
        author: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Delete a task comment (author only).
   */
  static async deleteTaskComment(
    db: AppDatabase,
    tenantId: string,
    userId: string,
    taskId: string,
    commentId: string
  ) {
    const comment = await db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
        eq(taskComments.tenantId, tenantId)
      ),
    });

    if (!comment) {
      throw {
        code: 'COMMENT_NOT_FOUND',
        message: 'Comment not found on this task.',
        status: 404,
      };
    }

    if (comment.authorUserId !== userId) {
      throw {
        code: 'FORBIDDEN_COMMENT_DELETE',
        message: 'You can only delete your own comments.',
        status: 403,
      };
    }

    await db.delete(taskComments).where(eq(taskComments.id, commentId));

    return { success: true, id: commentId };
  }

  /**
   * Get activity history for a task.
   */
  static async getTaskActivity(db: AppDatabase, tenantId: string, taskId: string) {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)),
    });

    if (!task) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found within this workspace.',
        status: 404,
      };
    }

    return db.query.taskActivity.findMany({
      where: and(eq(taskActivity.taskId, taskId), eq(taskActivity.tenantId, tenantId)),
      orderBy: [desc(taskActivity.createdAt)],
      with: {
        actor: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Real aggregated Dashboard Statistics.
   */
  static async getDashboardStatistics(
    db: AppDatabase,
    tenantId: string,
    userId: string
  ) {
    // 1. Projects stats
    const projectStats = await db
      .select({
        status: projects.status,
        count: count(),
      })
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .groupBy(projects.status);

    let totalProjects = 0;
    let activeProjects = 0;
    let completedProjects = 0;
    let onHoldProjects = 0;

    for (const ps of projectStats) {
      totalProjects += ps.count;
      if (ps.status === 'ACTIVE') activeProjects += ps.count;
      if (ps.status === 'COMPLETED') completedProjects += ps.count;
      if (ps.status === 'ON_HOLD') onHoldProjects += ps.count;
    }

    // 2. Tasks stats
    const taskStats = await db
      .select({
        status: tasks.status,
        count: count(),
      })
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId))
      .groupBy(tasks.status);

    let totalTasks = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;

    for (const ts of taskStats) {
      totalTasks += ts.count;
      if (ts.status === 'COMPLETED') completedTasks += ts.count;
      if (ts.status === 'IN_PROGRESS') inProgressTasks += ts.count;
    }

    // 3. Overdue tasks count
    const now = new Date();
    const overdueRes = await db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          lt(tasks.dueDate, now),
          ne(tasks.status, 'COMPLETED'),
          ne(tasks.status, 'CANCELLED')
        )
      );
    const overdueTasks = overdueRes[0]?.count ?? 0;

    // 4. Tasks assigned to current employee (if linked)
    let myOpenTasks = 0;
    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)),
    });

    if (employee) {
      const myTasksRes = await db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, tenantId),
            eq(tasks.assigneeEmployeeId, employee.id),
            ne(tasks.status, 'COMPLETED'),
            ne(tasks.status, 'CANCELLED')
          )
        );
      myOpenTasks = myTasksRes[0]?.count ?? 0;
    }

    // 5. Recent task activity
    const recentActivity = await db.query.taskActivity.findMany({
      where: eq(taskActivity.tenantId, tenantId),
      limit: 10,
      orderBy: [desc(taskActivity.createdAt)],
      with: {
        actor: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        task: {
          columns: {
            id: true,
            taskCode: true,
            title: true,
          },
        },
      },
    });

    return {
      projects: {
        total: totalProjects,
        active: activeProjects,
        completed: completedProjects,
        onHold: onHoldProjects,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        overdue: overdueTasks,
        myOpen: myOpenTasks,
      },
      recentActivity,
    };
  }
}
