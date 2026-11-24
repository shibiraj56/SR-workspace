import { z } from 'zod';
import { TASK_STATUS, TASK_PRIORITY } from '@sr-workspace/database';

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
  search: z.string().trim().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  assigneeEmployeeId: z.string().uuid().optional(),
  reporterEmployeeId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional().nullable(),
  overdue: z.coerce.boolean().optional(),
  sortBy: z.enum(['title', 'taskCode', 'status', 'priority', 'dueDate', 'createdAt', 'position']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createTaskSchema = z.object({
  projectId: z.string().uuid('Valid project ID is required.'),
  taskCode: z
    .string()
    .trim()
    .min(2, 'Task code must be at least 2 characters.')
    .max(25, 'Task code cannot exceed 25 characters.')
    .regex(/^[A-Z0-9_-]+$/, 'Task code must contain only uppercase letters, numbers, hyphens, and underscores.')
    .transform((v) => v.toUpperCase()),
  title: z.string().trim().min(2, 'Task title must be at least 2 characters.').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(TASK_STATUS).default('TODO'),
  priority: z.enum(TASK_PRIORITY).default('MEDIUM'),
  assigneeEmployeeId: z.string().uuid().optional().nullable(),
  reporterEmployeeId: z.string().uuid().optional().nullable(),
  parentTaskId: z.string().uuid().optional().nullable(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  position: z.number().int().min(0).default(0),
});

export const updateTaskSchema = createTaskSchema.partial().omit({ taskCode: true, projectId: true });

export const updateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUS),
});

export const updateTaskPrioritySchema = z.object({
  priority: z.enum(TASK_PRIORITY),
});

export const updateTaskAssigneeSchema = z.object({
  assigneeEmployeeId: z.string().uuid().nullable(),
});

export const updateTaskPositionSchema = z.object({
  position: z.number().int().min(0),
  status: z.enum(TASK_STATUS).optional(),
});

export const createTaskCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content cannot be empty.').max(2000),
});

export const updateTaskCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content cannot be empty.').max(2000),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
export type UpdateTaskCommentInput = z.infer<typeof updateTaskCommentSchema>;
