import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters.').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters.')
    .max(20)
    .toUpperCase(),
  description: z.string().trim().max(500).optional(),
  departmentHeadId: z.string().uuid('Invalid department head ID format.').optional().nullable(),
  organisationId: z.string().uuid('Invalid organisation ID format.').optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters.').max(100).optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters.')
    .max(20)
    .toUpperCase()
    .optional(),
  description: z.string().trim().max(500).optional().nullable(),
  departmentHeadId: z.string().uuid('Invalid department head ID format.').optional().nullable(),
  organisationId: z.string().uuid('Invalid organisation ID format.').optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateDepartmentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE'], {
    errorMap: () => ({ message: "Status must be either 'ACTIVE' or 'INACTIVE'." }),
  }),
});

export const listDepartmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt', 'status']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type UpdateDepartmentStatusInput = z.infer<typeof updateDepartmentStatusSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
