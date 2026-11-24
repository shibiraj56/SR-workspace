import { api } from '@/lib/api-client';
import type {
  Conversation,
  ConversationListResponse,
  ConversationMember,
  Message,
  MessageListResponse,
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
  ConversationType,
} from '@/types/communication';

export interface ListConversationsParams {
  type?: ConversationType;
  projectId?: string;
  archived?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateConversationPayload {
  type: ConversationType;
  name?: string;
  description?: string;
  projectId?: string;
  participantUserIds?: string[];
}

export interface UpdateConversationPayload {
  name?: string;
  description?: string | null;
  isArchived?: boolean;
}

export interface ListMessagesParams {
  limit?: number;
  cursor?: string;
  before?: string;
  since?: string;
}

export interface CreateMessagePayload {
  content: string;
  messageType?: 'TEXT' | 'SYSTEM';
  replyToMessageId?: string;
}

export interface ListNotificationsParams {
  isRead?: boolean;
  page?: number;
  limit?: number;
}

export const communicationApi = {
  // --- Conversations ---
  async listConversations(params: ListConversationsParams = {}): Promise<ConversationListResponse> {
    const searchParams = new URLSearchParams();
    if (params.type) searchParams.append('type', params.type);
    if (params.projectId) searchParams.append('projectId', params.projectId);
    if (params.archived !== undefined) searchParams.append('archived', String(params.archived));
    if (params.search?.trim()) searchParams.append('search', params.search.trim());
    if (params.page) searchParams.append('page', String(params.page));
    if (params.limit) searchParams.append('limit', String(params.limit));

    const qs = searchParams.toString();
    return api.get<ConversationListResponse>(`/api/v1/conversations${qs ? `?${qs}` : ''}`);
  },

  async getConversation(id: string): Promise<Conversation> {
    return api.get<Conversation>(`/api/v1/conversations/${id}`);
  },

  async createConversation(payload: CreateConversationPayload): Promise<Conversation> {
    return api.post<Conversation>('/api/v1/conversations', payload);
  },

  async updateConversation(id: string, payload: UpdateConversationPayload): Promise<Conversation> {
    return api.patch<Conversation>(`/api/v1/conversations/${id}`, payload);
  },

  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/api/v1/conversations/${id}`);
  },

  async listMembers(id: string): Promise<{ items: ConversationMember[] }> {
    return api.get<{ items: ConversationMember[] }>(`/api/v1/conversations/${id}/members`);
  },

  async addMember(
    id: string,
    payload: { userId: string; role?: 'ADMIN' | 'MEMBER' }
  ): Promise<ConversationMember> {
    return api.post<ConversationMember>(`/api/v1/conversations/${id}/members`, payload);
  },

  async removeMember(id: string, userId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/api/v1/conversations/${id}/members/${userId}`);
  },

  async markConversationRead(id: string): Promise<{ success: boolean; lastReadAt: string }> {
    return api.post<{ success: boolean; lastReadAt: string }>(`/api/v1/conversations/${id}/read`, {});
  },

  async muteConversation(id: string, muted: boolean): Promise<{ success: boolean; isMuted: boolean }> {
    return api.post<{ success: boolean; isMuted: boolean }>(`/api/v1/conversations/${id}/mute`, { muted });
  },

  // --- Messages ---
  async listMessages(
    conversationId: string,
    params: ListMessagesParams = {}
  ): Promise<MessageListResponse> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.append('limit', String(params.limit));
    if (params.cursor) searchParams.append('cursor', params.cursor);
    if (params.before) searchParams.append('before', params.before);
    if (params.since) searchParams.append('since', params.since);

    const qs = searchParams.toString();
    return api.get<MessageListResponse>(
      `/api/v1/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`
    );
  },

  async createMessage(conversationId: string, payload: CreateMessagePayload): Promise<Message> {
    return api.post<Message>(`/api/v1/conversations/${conversationId}/messages`, payload);
  },

  async searchMessages(
    query: string,
    conversationId?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ items: Message[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const searchParams = new URLSearchParams({
      query,
      page: String(page),
      limit: String(limit),
    });
    if (conversationId) searchParams.append('conversationId', conversationId);

    return api.get<{ items: Message[]; pagination: { total: number; page: number; limit: number; totalPages: number } }>(
      `/api/v1/messages/search?${searchParams.toString()}`
    );
  },

  async editMessage(id: string, content: string): Promise<Message> {
    return api.patch<Message>(`/api/v1/messages/${id}`, { content });
  },

  async deleteMessage(id: string): Promise<{ id: string; isDeleted: boolean; deletedAt: string }> {
    return api.delete<{ id: string; isDeleted: boolean; deletedAt: string }>(`/api/v1/messages/${id}`);
  },

  async addReaction(
    id: string,
    reaction: string
  ): Promise<{ messageId: string; reaction: string; added: boolean }> {
    return api.post<{ messageId: string; reaction: string; added: boolean }>(
      `/api/v1/messages/${id}/reactions`,
      { reaction }
    );
  },

  async removeReaction(
    id: string,
    reaction: string
  ): Promise<{ messageId: string; reaction: string; removed: boolean }> {
    return api.delete<{ messageId: string; reaction: string; removed: boolean }>(
      `/api/v1/messages/${id}/reactions`,
      { body: JSON.stringify({ reaction }) }
    );
  },

  // --- Notifications ---
  async listNotifications(params: ListNotificationsParams = {}): Promise<NotificationListResponse> {
    const searchParams = new URLSearchParams();
    if (params.isRead !== undefined) searchParams.append('isRead', String(params.isRead));
    if (params.page) searchParams.append('page', String(params.page));
    if (params.limit) searchParams.append('limit', String(params.limit));

    const qs = searchParams.toString();
    return api.get<NotificationListResponse>(`/api/v1/notifications${qs ? `?${qs}` : ''}`);
  },

  async getNotificationUnreadCount(): Promise<UnreadCountResponse> {
    return api.get<UnreadCountResponse>('/api/v1/notifications/unread-count');
  },

  async markNotificationRead(id: string): Promise<{ id: string; isRead: boolean }> {
    return api.patch<{ id: string; isRead: boolean }>(`/api/v1/notifications/${id}/read`, {});
  },

  async markAllNotificationsRead(): Promise<{ success: boolean; count: number }> {
    return api.post<{ success: boolean; count: number }>('/api/v1/notifications/read-all', {});
  },

  async dismissNotification(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/api/v1/notifications/${id}`);
  },
};
