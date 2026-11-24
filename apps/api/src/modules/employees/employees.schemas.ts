import { z } from 'zod';

export const employmentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const employmentStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2, 'Employee code must be at least 2 characters.')
    .max(30)
    .toUpperCase(),
  firstName: z.string().trim().min(1, 'First name is required.').max(50),
  lastName: z.string().trim().min(1, 'Last name is required.').max(50),
  workEmail: z.string().trim().email('Invalid work email address format.').optional().nullable(),
  personalEmail: z.string().trim().email('Invalid personal email address format.').optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  departmentId: z.string().uuid('Invalid department ID format.').optional().nullable(),
  managerEmployeeId: z.string().uuid('Invalid manager ID format.').optional().nullable(),
  userId: z.string().uuid('Invalid user ID format.').optional().nullable(),
  organisationId: z.string().uuid('Invalid organisation ID format.').optional().nullable(),
  branchId: z.string().uuid('Invalid branch ID format.').optional().nullable(),
  employmentType: employmentTypeEnum.default('FULL_TIME'),
  employmentStatus: employmentStatusEnum.default('ACTIVE'),
  joiningDate: z.coerce.date().default(() => new Date()),
  profileImageUrl: z.string().url('Invalid image URL format.').optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2, 'Employee code must be at least 2 characters.')
    .max(30)
    .toUpperCase()
    .optional(),
  firstName: z.string().trim().min(1, 'First name is required.').max(50).optional(),
  lastName: z.string().trim().min(1, 'Last name is required.').max(50).optional(),
  workEmail: z.string().trim().email('Invalid work email address format.').optional().nullable(),
  personalEmail: z.string().trim().email('Invalid personal email address format.').optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  departmentId: z.string().uuid('Invalid department ID format.').optional().nullable(),
  managerEmployeeId: z.string().uuid('Invalid manager ID format.').optional().nullable(),
  userId: z.string().uuid('Invalid user ID format.').optional().nullable(),
  organisationId: z.string().uuid('Invalid organisation ID format.').optional().nullable(),
  branchId: z.string().uuid('Invalid branch ID format.').optional().nullable(),
  employmentType: employmentTypeEnum.optional(),
  employmentStatus: employmentStatusEnum.optional(),
  joiningDate: z.coerce.date().optional(),
  profileImageUrl: z.string().url('Invalid image URL format.').optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateEmployeeStatusSchema = z.object({
  status: employmentStatusEnum,
});

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  departmentId: z.string().uuid().optional(),
  employmentStatus: employmentStatusEnum.optional(),
  employmentType: employmentTypeEnum.optional(),
  sortBy: z.enum(['firstName', 'lastName', 'employeeCode', 'joiningDate', 'createdAt']).default('firstName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type UpdateEmployeeStatusInput = z.infer<typeof updateEmployeeStatusSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
