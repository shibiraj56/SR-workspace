import { z } from 'zod';
import { PROJECT_STATUS, PROJECT_PRIORITY, PROJECT_ROLE } from '@sr-workspace/database';

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  priority: z.enum(PROJECT_PRIORITY).optional(),
  departmentId: z.string().uuid().optional(),
  ownerEmployeeId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'projectCode', 'status', 'priority', 'dueDate', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createProjectSchema = z.object({
  projectCode: z
    .string()
    .trim()
    .min(2, 'Project code must be at least 2 characters.')
    .max(20, 'Project code cannot exceed 20 characters.')
    .regex(/^[A-Z0-9_-]+$/, 'Project code must contain only uppercase letters, numbers, hyphens, and underscores.')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Project name must be at least 2 characters.').max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(PROJECT_STATUS).default('PLANNING'),
  priority: z.enum(PROJECT_PRIORITY).default('MEDIUM'),
  ownerEmployeeId: z.string().uuid('Valid employee ID is required for project owner.'),
  departmentId: z.string().uuid().optional().nullable(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
});

export const updateProjectSchema = createProjectSchema.partial().omit({ projectCode: true });

export const updateProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUS),
});

export const updateProjectPrioritySchema = z.object({
  priority: z.enum(PROJECT_PRIORITY),
});

export const addProjectMemberSchema = z.object({
  employeeId: z.string().uuid('Valid employee ID is required.'),
  projectRole: z.enum(PROJECT_ROLE).default('MEMBER'),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
