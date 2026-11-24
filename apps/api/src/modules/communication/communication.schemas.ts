import { z } from 'zod';
import { CONVERSATION_TYPE, CONVERSATION_MEMBER_ROLE, MESSAGE_TYPE } from '@sr-workspace/database';

export const listConversationsQuerySchema = z.object({
  type: z.enum(CONVERSATION_TYPE).optional(),
  projectId: z.string().optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const createConversationSchema = z
  .object({
    type: z.enum(CONVERSATION_TYPE),
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    projectId: z.string().optional(),
    participantUserIds: z.array(z.string().min(1)).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'DIRECT') {
      if (!data.participantUserIds || data.participantUserIds.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participantUserIds'],
          message: 'Direct conversation requires at least one participant user ID.',
        });
      }
    } else if (data.type === 'GROUP' || data.type === 'CHANNEL') {
      if (!data.name || data.name.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: `${data.type} conversation requires a non-empty name.`,
        });
      }
    } else if (data.type === 'PROJECT') {
      if (!data.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projectId'],
          message: 'Project conversation requires a projectId.',
        });
      }
    }
  });

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isArchived: z.boolean().optional(),
});

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const addConversationMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export type AddConversationMemberInput = z.infer<typeof addConversationMemberSchema>;

export const muteConversationSchema = z.object({
  muted: z.boolean().default(true),
});

export type MuteConversationInput = z.infer<typeof muteConversationSchema>;

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  before: z.string().optional(),
  since: z.string().optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const createMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty.').max(5000, 'Message cannot exceed 5000 characters.'),
  messageType: z.enum(MESSAGE_TYPE).default('TEXT'),
  replyToMessageId: z.string().optional(),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const updateMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty.').max(5000, 'Message cannot exceed 5000 characters.'),
});

export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export const messageReactionSchema = z.object({
  reaction: z.string().trim().min(1, 'Reaction emoji cannot be empty.').max(32, 'Reaction cannot exceed 32 characters.'),
});

export type MessageReactionInput = z.infer<typeof messageReactionSchema>;

export const searchMessagesQuerySchema = z.object({
  query: z.string().trim().min(2, 'Search query must be at least 2 characters.'),
  conversationId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;

export const listNotificationsQuerySchema = z.object({
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
