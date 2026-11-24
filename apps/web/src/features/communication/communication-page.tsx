import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { communicationApi } from './api/communication-api';
import type {
  Conversation,
  ConversationType,
  ConversationMember,
  Message,
} from '@/types/communication';
import { ConversationList } from './components/conversation-list';
import { ChatArea } from './components/chat-area';
import { DetailsPanel } from './components/details-panel';
import { NewDirectModal } from './components/new-direct-modal';
import { CreateGroupModal } from './components/create-group-modal';
import { CreateChannelModal } from './components/create-channel-modal';
import { CreateProjectModal } from './components/create-project-modal';
import { AddMemberModal } from './components/add-member-modal';
import { MessageSearchModal } from './components/message-search-modal';

export function CommunicationPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryConversationId = searchParams.get('id');

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [selectedTab, setSelectedTab] = useState<'ALL' | ConversationType>('ALL');
  const [conversationSearch, setConversationSearch] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Members state for active conversation
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Modals state
  const [isNewDirectOpen, setIsNewDirectOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Refs for tracking in-flight polling and cursors
  const isPollingRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversation?.id || null;
  nextCursorRef.current = nextCursor;

  // 1. Fetch conversations list
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingConversations(true);
    try {
      const res = await communicationApi.listConversations({ limit: 100 });
      setConversations(res.items || []);
      return res.items || [];
    } catch {
      return [];
    } finally {
      if (!silent) setIsLoadingConversations(false);
    }
  }, []);

  // 2. Fetch conversation members
  const fetchMembers = useCallback(async (conversationId: string) => {
    setIsLoadingMembers(true);
    try {
      const res = await communicationApi.listMembers(conversationId);
      setMembers(res.items || []);
    } catch {
      setMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }, []);

  // 3. Fetch initial messages for active conversation
  const fetchInitialMessages = useCallback(
    async (convId: string) => {
      setIsLoadingMessages(true);
      try {
        const res = await communicationApi.listMessages(convId, { limit: 50 });
        setMessages(res.items || []);
        setHasMoreOlder(res.pagination.hasMore);
        setPrevCursor(res.pagination.prevCursor);
        setNextCursor(res.pagination.nextCursor);
        nextCursorRef.current = res.pagination.nextCursor;

        // Mark conversation as read
        await communicationApi.markConversationRead(convId);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
        );
      } catch {
        setMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    []
  );

  // 4. Load older messages (backward history pagination)
  const handleLoadOlder = async () => {
    if (!activeConversation || !prevCursor || isLoadingOlder) return;

    setIsOlderLoading: setIsLoadingOlder(true);
    try {
      const res = await communicationApi.listMessages(activeConversation.id, {
        limit: 30,
        before: prevCursor,
      });

      setMessages((prev) => {
        // Prepend older messages avoiding duplicates
        const existingIds = new Set(prev.map((m) => m.id));
        const newOlder = (res.items || []).filter((m) => !existingIds.has(m.id));
        return [...newOlder, ...prev];
      });

      setHasMoreOlder(res.pagination.hasMore);
      setPrevCursor(res.pagination.prevCursor);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // 5. Select conversation handler
  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      setActiveConversation(conv);
      setSearchParams({ id: conv.id }, { replace: true });
      fetchInitialMessages(conv.id);
      fetchMembers(conv.id);
    },
    [fetchInitialMessages, fetchMembers, setSearchParams]
  );

  // Initial load
  useEffect(() => {
    fetchConversations().then((items) => {
      if (items.length > 0) {
        if (queryConversationId) {
          const matched = items.find((c) => c.id === queryConversationId);
          if (matched) {
            handleSelectConversation(matched);
            return;
          }
        }
        // Default to first conversation
        handleSelectConversation(items[0]);
      }
    });
  }, [fetchConversations, queryConversationId, handleSelectConversation]);

  // 6. Polling effect: Polls active conversation messages and refreshes unread count
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const poll = async () => {
      const currentConvId = activeConversationIdRef.current;
      const currentCursor = nextCursorRef.current;

      if (!currentConvId || isPollingRef.current) return;

      isPollingRef.current = true;
      try {
        // Delta forward poll
        if (currentCursor) {
          const res = await communicationApi.listMessages(currentConvId, {
            since: currentCursor,
          });

          if (res.items && res.items.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newArrivals = res.items.filter((m) => !existingIds.has(m.id));
              return [...prev, ...newArrivals];
            });

            if (res.pagination.nextCursor) {
              setNextCursor(res.pagination.nextCursor);
              nextCursorRef.current = res.pagination.nextCursor;
            }

            // Acknowledge read for the current conversation
            await communicationApi.markConversationRead(currentConvId);
          }
        }

        // Silent refresh of conversation unread counts and previews
        const updatedConvs = await communicationApi.listConversations({ limit: 100 });
        setConversations(updatedConvs.items || []);
      } catch {
        // Silently tolerate intermittent network drops
      } finally {
        isPollingRef.current = false;
        // Schedule next poll based on tab visibility
        const isVisible = document.visibilityState === 'visible';
        const delay = isVisible ? 3500 : 30000;
        timer = setTimeout(poll, delay);
      }
    };

    // Start polling cycle
    timer = setTimeout(poll, 3500);

    return () => {
      clearTimeout(timer);
    };
  }, [activeConversation?.id]);

  // 7. Message actions
  const handleSendMessage = async (content: string, replyToMessageId?: string) => {
    if (!activeConversation) return;
    const newMsg = await communicationApi.createMessage(activeConversation.id, {
      content,
      replyToMessageId,
    });

    setMessages((prev) => [...prev, newMsg]);

    // Advance delta cursor so forward polling only fetches subsequent messages
    const cursorStr = btoa(
      JSON.stringify({ t: new Date(newMsg.createdAt).getTime(), id: newMsg.id })
    );
    nextCursorRef.current = cursorStr;
    setNextCursor(cursorStr);

    // Update conversation lastMessage preview
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              lastMessagePreview: content,
              lastMessageAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    const updated = await communicationApi.editMessage(messageId, content);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
  };

  const handleDeleteMessage = async (messageId: string) => {
    await communicationApi.deleteMessage(messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              isDeleted: true,
              content: '[This message was deleted]',
              deletedAt: new Date().toISOString(),
            }
          : m
      )
    );
  };

  const handleReactMessage = async (messageId: string, reaction: string) => {
    await communicationApi.addReaction(messageId, reaction);
    // Optimistic reaction update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = m.reactions || [];
        const existing = currentReactions.find((r) => r.reaction === reaction);

        let updatedReactions;
        if (existing) {
          updatedReactions = currentReactions.map((r) =>
            r.reaction === reaction
              ? {
                  ...r,
                  count: r.hasReacted ? r.count : r.count + 1,
                  hasReacted: true,
                  users: r.hasReacted
                    ? r.users
                    : [...r.users, { id: user?.id || '', name: `${user?.firstName} ${user?.lastName}` }],
                }
              : r
          );
        } else {
          updatedReactions = [
            ...currentReactions,
            {
              reaction,
              count: 1,
              hasReacted: true,
              users: [{ id: user?.id || '', name: `${user?.firstName} ${user?.lastName}` }],
            },
          ];
        }
        return { ...m, reactions: updatedReactions };
      })
    );
  };

  const handleRemoveReaction = async (messageId: string, reaction: string) => {
    await communicationApi.removeReaction(messageId, reaction);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = m.reactions || [];
        const updatedReactions = currentReactions
          .map((r) =>
            r.reaction === reaction
              ? {
                  ...r,
                  count: Math.max(0, r.count - 1),
                  hasReacted: false,
                  users: r.users.filter((u) => u.id !== user?.id),
                }
              : r
          )
          .filter((r) => r.count > 0);

        return { ...m, reactions: updatedReactions };
      })
    );
  };

  const handleToggleMute = async () => {
    if (!activeConversation) return;
    const isCurrentlyMuted = activeConversation.membership?.isMuted ?? false;
    const nextMuted = !isCurrentlyMuted;

    await communicationApi.muteConversation(activeConversation.id, nextMuted);
    setActiveConversation((prev) =>
      prev
        ? {
            ...prev,
            membership: prev.membership
              ? { ...prev.membership, isMuted: nextMuted }
              : { role: 'MEMBER', isMuted: nextMuted },
          }
        : null
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              membership: c.membership
                ? { ...c.membership, isMuted: nextMuted }
                : { role: 'MEMBER', isMuted: nextMuted },
            }
          : c
      )
    );
  };

  const handleArchiveConversation = async (archive: boolean) => {
    if (!activeConversation) return;
    const updated = await communicationApi.updateConversation(activeConversation.id, {
      isArchived: archive,
    });
    setActiveConversation(updated);
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? updated : c))
    );
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeConversation) return;
    await communicationApi.removeMember(activeConversation.id, userId);

    if (userId === user?.id) {
      // User left conversation; deselect and refresh
      setActiveConversation(null);
      fetchConversations();
    } else {
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    }
  };

  const handleCreatedConversation = (newConv: Conversation) => {
    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
    handleSelectConversation(newConv);
  };

  const handleSelectSearchResult = (convId: string, messageId: string) => {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      handleSelectConversation(conv);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden h-[calc(100vh-4rem)] bg-white">
      {/* 1. Left Sidebar: Conversations list */}
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        selectedTab={selectedTab}
        onSelectTab={setSelectedTab}
        search={conversationSearch}
        onSearchChange={setConversationSearch}
        onSelectConversation={handleSelectConversation}
        onOpenNewDirect={() => setIsNewDirectOpen(true)}
        onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
        onOpenCreateChannel={() => setIsCreateChannelOpen(true)}
        onOpenCreateProject={() => setIsCreateProjectOpen(true)}
        isLoading={isLoadingConversations}
      />

      {/* 2. Main Chat Area */}
      <ChatArea
        conversation={activeConversation}
        messages={messages}
        isLoadingMessages={isLoadingMessages}
        hasMoreOlder={hasMoreOlder}
        onLoadOlder={handleLoadOlder}
        isLoadingOlder={isLoadingOlder}
        onSendMessage={handleSendMessage}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onReactMessage={handleReactMessage}
        onRemoveReaction={handleRemoveReaction}
        onToggleMute={handleToggleMute}
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
        isDetailsOpen={isDetailsOpen}
      />

      {/* 3. Optional Right Details Panel */}
      {isDetailsOpen && activeConversation && (
        <DetailsPanel
          conversation={activeConversation}
          members={members}
          isLoadingMembers={isLoadingMembers}
          onClose={() => setIsDetailsOpen(false)}
          onOpenAddMember={() => setIsAddMemberOpen(true)}
          onRemoveMember={handleRemoveMember}
          onToggleMute={handleToggleMute}
          onArchiveConversation={handleArchiveConversation}
        />
      )}

      {/* Modals */}
      <NewDirectModal
        isOpen={isNewDirectOpen}
        onClose={() => setIsNewDirectOpen(false)}
        onSuccess={handleCreatedConversation}
      />

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onSuccess={handleCreatedConversation}
      />

      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        onClose={() => setIsCreateChannelOpen(false)}
        onSuccess={handleCreatedConversation}
      />

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onSuccess={handleCreatedConversation}
      />

      {activeConversation && (
        <AddMemberModal
          isOpen={isAddMemberOpen}
          conversationId={activeConversation.id}
          existingMemberUserIds={members.map((m) => m.userId)}
          onClose={() => setIsAddMemberOpen(false)}
          onSuccess={(newMember) => setMembers((prev) => [...prev, newMember])}
        />
      )}

      <MessageSearchModal
        isOpen={isSearchOpen}
        activeConversationId={activeConversation?.id}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />
    </div>
  );
}
