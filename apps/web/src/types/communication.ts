export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL' | 'PROJECT';
export type ConversationMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type MessageType = 'TEXT' | 'SYSTEM';

export interface ConversationUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
}

export interface ConversationMember {
  id: string;
  userId: string;
  role: ConversationMemberRole;
  joinedAt: string;
  mutedAt?: string | null;
  lastReadAt?: string | null;
  user?: ConversationUser;
}

export interface ConversationProjectSummary {
  id: string;
  projectCode: string;
  name: string;
}

export interface ConversationMembership {
  role: ConversationMemberRole;
  isMuted: boolean;
  mutedAt?: string | null;
  lastReadAt?: string | null;
}

export interface Conversation {
  id: string;
  tenantId: string;
  type: ConversationType;
  name: string;
  description?: string | null;
  projectId?: string | null;
  project?: ConversationProjectSummary | null;
  directUser?: ConversationUser | null;
  memberCount?: number;
  members?: ConversationMember[];
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  isArchived: boolean;
  unreadCount: number;
  membership?: ConversationMembership | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSender {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
}

export interface MessageReactionUser {
  id: string;
  name: string;
}

export interface MessageReaction {
  reaction: string;
  count: number;
  users: MessageReactionUser[];
  hasReacted: boolean;
}

export interface MessageReplyTo {
  id: string;
  content: string;
  senderName?: string;
}

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  senderUserId: string;
  sender?: MessageSender;
  messageType: MessageType;
  content: string;
  replyToMessageId?: string | null;
  replyTo?: MessageReplyTo | null;
  isEdited: boolean;
  editedAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  reactions?: MessageReaction[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageListPagination {
  hasMore: boolean;
  limit: number;
  prevCursor: string | null;
  nextCursor: string | null;
}

export interface MessageListResponse {
  items: Message[];
  pagination: MessageListPagination;
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface NotificationActor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
}

export interface NotificationItem {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  conversationId?: string | null;
  messageId?: string | null;
  actor?: NotificationActor | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UnreadCountResponse {
  unreadCount?: number;
  count?: number;
}
