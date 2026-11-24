import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address format.'),
  password: z.string().min(1, 'Password is required.'),
});

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(100, 'Password is too long.'),
  firstName: z.string().trim().min(1, 'First name is required.').max(50),
  lastName: z.string().trim().min(1, 'Last name is required.').max(50),
  tenantName: z.string().trim().min(2, 'Tenant name must be at least 2 characters.').max(100).optional(),
  setupKey: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
