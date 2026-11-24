import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { employees } from './employees';
import { departments } from './departments';
import { users } from './users';

export const PROJECT_STATUS = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITY)[number];

export const PROJECT_ROLE = ['PROJECT_MANAGER', 'MEMBER', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLE)[number];

/**
 * Projects Table
 * Represents high-level organizational projects scoped strictly to tenants.
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectCode: text('project_code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUS })
      .notNull()
      .default('PLANNING'),
    priority: text('priority', { enum: PROJECT_PRIORITY })
      .notNull()
      .default('MEDIUM'),
    ownerEmployeeId: text('owner_employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    departmentId: text('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    startDate: integer('start_date', { mode: 'timestamp_ms' }),
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
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
    tenantIdx: index('projects_tenant_idx').on(table.tenantId),
    tenantCodeUniqueIdx: uniqueIndex('projects_tenant_code_idx').on(
      table.tenantId,
      table.projectCode
    ),
    ownerIdx: index('projects_owner_idx').on(table.ownerEmployeeId),
    departmentIdx: index('projects_department_idx').on(table.departmentId),
    statusIdx: index('projects_status_idx').on(table.status),
    priorityIdx: index('projects_priority_idx').on(table.priority),
    dueDateIdx: index('projects_due_date_idx').on(table.dueDate),
  })
);

/**
 * Project Members Table
 * Explicit project membership linking employees to projects with assigned project roles.
 */
export const projectMembers = sqliteTable(
  'project_members',
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
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    projectRole: text('project_role', { enum: PROJECT_ROLE })
      .notNull()
      .default('MEMBER'),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('project_members_tenant_idx').on(table.tenantId),
    projectIdx: index('project_members_project_idx').on(table.projectId),
    employeeIdx: index('project_members_employee_idx').on(table.employeeId),
    projectEmployeeUniqueIdx: uniqueIndex('project_members_project_employee_idx').on(
      table.projectId,
      table.employeeId
    ),
  })
);
