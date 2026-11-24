import React, { useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import type { Conversation, ConversationType } from '@/types/communication';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  Plus,
  MessageSquare,
  Users,
  Hash,
  FolderKanban,
  User,
  BellOff,
  ChevronDown,
} from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: string;
  selectedTab: 'ALL' | ConversationType;
  onSelectTab: (tab: 'ALL' | ConversationType) => void;
  search: string;
  onSearchChange: (search: string) => void;
  onSelectConversation: (conv: Conversation) => void;
  onOpenNewDirect: () => void;
  onOpenCreateGroup: () => void;
  onOpenCreateChannel: () => void;
  onOpenCreateProject: () => void;
  isLoading: boolean;
}

function formatRelativeTime(timestamp?: string | number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationList({
  conversations,
  activeConversationId,
  selectedTab,
  onSelectTab,
  search,
  onSearchChange,
  onSelectConversation,
  onOpenNewDirect,
  onOpenCreateGroup,
  onOpenCreateChannel,
  onOpenCreateProject,
  isLoading,
}: ConversationListProps) {
  const { permissions, roles } = useAuth();
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Check RBAC permission for creating channels
  const canCreateChannel =
    permissions.includes('communication:create_channel') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('TENANT_ADMIN') ||
    roles.includes('ORG_ADMIN');

  const filteredConversations = conversations.filter((conv) => {
    // Tab filter
    if (selectedTab !== 'ALL' && conv.type !== selectedTab) {
      return false;
    }
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const nameMatch = (conv.name || '').toLowerCase().includes(q);
      const previewMatch = (conv.lastMessagePreview || '').toLowerCase().includes(q);
      return nameMatch || previewMatch;
    }
    return true;
  });

  const getConversationIcon = (type: ConversationType) => {
    switch (type) {
      case 'DIRECT':
        return <User className="w-3.5 h-3.5" />;
      case 'GROUP':
        return <Users className="w-3.5 h-3.5" />;
      case 'CHANNEL':
        return <Hash className="w-3.5 h-3.5" />;
      case 'PROJECT':
        return <FolderKanban className="w-3.5 h-3.5" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="w-80 md:w-84 border-r border-neutral-200 bg-white flex flex-col shrink-0 select-none h-full">
      {/* Header & New Actions */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base text-neutral-900 tracking-tight">Messages</h2>
            <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
              {conversations.length}
            </span>
          </div>

          {/* Action Trigger Dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className="h-8 px-2.5 gap-1.5 text-xs shadow-sm bg-brand-600 hover:bg-brand-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
            </Button>

            {isActionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsActionsOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg py-1.5 z-30 text-xs">
                  <button
                    onClick={() => {
                      setIsActionsOpen(false);
                      onOpenNewDirect();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-neutral-700 hover:bg-neutral-50 hover:text-brand-600 text-left font-medium transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-brand-500" />
                    <span>Direct Message</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsActionsOpen(false);
                      onOpenCreateGroup();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-neutral-700 hover:bg-neutral-50 hover:text-brand-600 text-left font-medium transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Group Chat</span>
                  </button>
                  {canCreateChannel && (
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        onOpenCreateChannel();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-neutral-700 hover:bg-neutral-50 hover:text-brand-600 text-left font-medium transition-colors"
                    >
                      <Hash className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Public Channel</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsActionsOpen(false);
                      onOpenCreateProject();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-neutral-700 hover:bg-neutral-50 hover:text-brand-600 text-left font-medium transition-colors"
                  >
                    <FolderKanban className="w-3.5 h-3.5 text-amber-500" />
                    <span>Project Discussion</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-8 text-xs bg-neutral-50 border-neutral-200/80 focus:bg-white"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pt-2 pb-1 border-b border-neutral-100 flex items-center gap-1 overflow-x-auto text-xs no-scrollbar">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'DIRECT', label: 'Direct' },
          { key: 'GROUP', label: 'Groups' },
          { key: 'CHANNEL', label: 'Channels' },
          { key: 'PROJECT', label: 'Projects' },
        ].map((tab) => {
          const isActive = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key as 'ALL' | ConversationType)}
              className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-neutral-900 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 p-2 space-y-0.5">
        {isLoading && conversations.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400">
            Loading conversations...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 px-4">
            {search.trim()
              ? 'No conversations match your search.'
              : selectedTab !== 'ALL'
              ? `No ${selectedTab.toLowerCase()} conversations yet.`
              : 'No conversations yet. Start a discussion above!'}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const initials = conv.name
              ? conv.name
                  .split(' ')
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join('')
                  .toUpperCase()
              : 'DM';

            const isMuted = conv.membership?.isMuted;
            const hasUnread = conv.unreadCount > 0;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3 border ${
                  isActive
                    ? 'bg-brand-50/70 border-brand-200 shadow-xs'
                    : 'border-transparent hover:bg-neutral-50 hover:border-neutral-200/60'
                }`}
              >
                {/* Avatar with indicator */}
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full font-semibold text-xs flex items-center justify-center ${
                      conv.type === 'DIRECT'
                        ? 'bg-purple-100 text-purple-700'
                        : conv.type === 'GROUP'
                        ? 'bg-indigo-100 text-indigo-700'
                        : conv.type === 'CHANNEL'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {conv.type === 'CHANNEL' ? (
                      <Hash className="w-4 h-4" />
                    ) : (
                      initials.slice(0, 2)
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-white shadow-xs text-neutral-400">
                    {getConversationIcon(conv.type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-brand-900' : 'text-neutral-900'
                      }`}
                    >
                      {conv.type === 'CHANNEL' && !conv.name.startsWith('#')
                        ? `#${conv.name}`
                        : conv.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 shrink-0 ml-1">
                      {formatRelativeTime(conv.lastMessageAt || conv.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs truncate ${
                        hasUnread
                          ? 'font-medium text-neutral-900'
                          : 'text-neutral-500'
                      }`}
                    >
                      {conv.lastMessagePreview || (
                        <span className="italic text-neutral-400">No messages yet</span>
                      )}
                    </p>

                    <div className="flex items-center gap-1 shrink-0">
                      {isMuted && (
                        <BellOff className="w-3 h-3 text-neutral-400" />
                      )}
                      {hasUnread && (
                        <span className="min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
