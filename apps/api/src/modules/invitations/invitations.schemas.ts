import { z } from 'zod';

export const INVITATION_EXPIRY_DURATIONS = {
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
} as const;

export type InvitationExpiryDuration = keyof typeof INVITATION_EXPIRY_DURATIONS;

export const inviteEmployeeSchema = z.object({
  roleId: z.string().trim().min(1, 'Role ID must not be empty.').optional(),
  expiresIn: z.enum(['48h', '7d', '14d']).default('7d'),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(100, 'Password is too long.'),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
