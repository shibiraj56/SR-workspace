import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { projects } from './projects';
import { employees } from './employees';
import { users } from './users';

export const TASK_STATUS = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

/**
 * Tasks Table
 * Work items scoped to projects and tenants.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskCode: text('task_code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: TASK_STATUS })
      .notNull()
      .default('TODO'),
    priority: text('priority', { enum: TASK_PRIORITY })
      .notNull()
      .default('MEDIUM'),
    assigneeEmployeeId: text('assignee_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    reporterEmployeeId: text('reporter_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    parentTaskId: text('parent_task_id'),
    startDate: integer('start_date', { mode: 'timestamp_ms' }),
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    position: integer('position').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('tasks_tenant_idx').on(table.tenantId),
    projectIdx: index('tasks_project_idx').on(table.projectId),
    tenantCodeUniqueIdx: uniqueIndex('tasks_tenant_code_idx').on(
      table.tenantId,
      table.taskCode
    ),
    assigneeIdx: index('tasks_assignee_idx').on(table.assigneeEmployeeId),
    reporterIdx: index('tasks_reporter_idx').on(table.reporterEmployeeId),
    statusIdx: index('tasks_status_idx').on(table.status),
    priorityIdx: index('tasks_priority_idx').on(table.priority),
    dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
    positionIdx: index('tasks_position_idx').on(table.projectId, table.status, table.position),
    parentTaskIdx: index('tasks_parent_task_idx').on(table.parentTaskId),
  })
);

/**
 * Task Comments Table
 * Contextual discussion entries on tasks by authenticated users.
 */
export const taskComments = sqliteTable(
  'task_comments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('task_comments_tenant_idx').on(table.tenantId),
    taskIdx: index('task_comments_task_idx').on(table.taskId),
    authorIdx: index('task_comments_author_idx').on(table.authorUserId),
    createdIdx: index('task_comments_created_idx').on(table.taskId, table.createdAt),
  })
);

/**
 * Task Activity History Table
 * Auditable change history on tasks (status changes, reassignments, priority changes).
 */
export const taskActivity = sqliteTable(
  'task_activity',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('task_activity_tenant_idx').on(table.tenantId),
    taskIdx: index('task_activity_task_idx').on(table.taskId),
    createdIdx: index('task_activity_created_idx').on(table.taskId, table.createdAt),
  })
);
