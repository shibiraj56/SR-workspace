import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import type {
  Conversation,
  Message,
  MessageReplyTo,
} from '@/types/communication';
import { Button } from '@/components/ui/button';
import {
  Send,
  CornerDownRight,
  Smile,
  Edit2,
  Trash2,
  X,
  Search,
  Bell,
  BellOff,
  Info,
  Loader2,
  Check,
  Hash,
  Users,
  User,
  FolderKanban,
  ArrowDown,
  MessageSquare,
} from 'lucide-react';

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Message[];
  isLoadingMessages: boolean;
  hasMoreOlder: boolean;
  onLoadOlder: () => void;
  isLoadingOlder: boolean;
  onSendMessage: (content: string, replyToMessageId?: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReactMessage: (messageId: string, reaction: string) => Promise<void>;
  onRemoveReaction: (messageId: string, reaction: string) => Promise<void>;
  onToggleMute: () => Promise<void>;
  onOpenSearch: () => void;
  onToggleDetails: () => void;
  isDetailsOpen: boolean;
}

const COMMON_REACTIONS = ['👍', '❤️', '🎉', '😄', '🚀', '👀'];

function formatMessageTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDateSeparator(timestamp: string): string {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return 'Today';
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ChatArea({
  conversation,
  messages,
  isLoadingMessages,
  hasMoreOlder,
  onLoadOlder,
  isLoadingOlder,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReactMessage,
  onRemoveReaction,
  onToggleMute,
  onOpenSearch,
  onToggleDetails,
  isDetailsOpen,
}: ChatAreaProps) {
  const { user, roles, permissions } = useAuth();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Message inline edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete confirm state
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reaction picker hover state
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on initial message load or new message
  useEffect(() => {
    if (!isLoadingMessages && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation?.id, messages.length, isLoadingMessages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50/50 p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 shadow-xs">
          <Hash className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-lg text-neutral-900 mb-1">Your Communications Center</h3>
        <p className="text-sm text-neutral-500 max-w-sm">
          Select an existing conversation from the list or start a new direct message, group discussion, or channel.
        </p>
      </div>
    );
  }

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending) return;

    const messageText = content.trim();
    const replyId = replyingTo?.id;

    setIsSending(true);
    try {
      setContent('');
      setReplyingTo(null);
      await onSendMessage(messageText, replyId);
      inputRef.current?.focus();
    } catch {
      setContent(messageText); // restore on failure
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim() || isSubmittingEdit) return;
    setIsSubmittingEdit(true);
    try {
      await onEditMessage(messageId, editContent.trim());
      setEditingMessageId(null);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    setIsDeleting(true);
    try {
      await onDeleteMessage(messageId);
      setDeletingMessageId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const canManageMessage = (msg: Message) => {
    if (msg.senderUserId === user?.id) return true;
    return (
      roles.includes('SUPER_ADMIN') ||
      roles.includes('TENANT_ADMIN') ||
      roles.includes('ORG_ADMIN') ||
      permissions.includes('communication:manage_messages')
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden h-full">
      {/* Conversation Header */}
      <div className="h-16 px-6 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              conversation.type === 'DIRECT'
                ? 'bg-purple-100 text-purple-700'
                : conversation.type === 'GROUP'
                ? 'bg-indigo-100 text-indigo-700'
                : conversation.type === 'CHANNEL'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {conversation.type === 'CHANNEL' ? (
              <Hash className="w-4 h-4" />
            ) : (
              (conversation.name || 'C').slice(0, 2).toUpperCase()
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-neutral-900 truncate">
                {conversation.type === 'CHANNEL' && !conversation.name.startsWith('#')
                  ? `#${conversation.name}`
                  : conversation.name}
              </h2>
              {conversation.project && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80">
                  {conversation.project.projectCode}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 truncate">
              {conversation.description ||
                (conversation.type === 'DIRECT'
                  ? conversation.directUser?.email || 'Direct Conversation'
                  : `${conversation.memberCount || 1} member(s)`)}
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onOpenSearch}
            title="Search messages"
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMute}
            title={conversation.membership?.isMuted ? 'Unmute conversation' : 'Mute conversation'}
            className={`p-2 rounded-lg transition-colors ${
              conversation.membership?.isMuted
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            {conversation.membership?.isMuted ? (
              <BellOff className="w-4 h-4" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onToggleDetails}
            title="Conversation details"
            className={`p-2 rounded-lg transition-colors ${
              isDetailsOpen
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-neutral-50/30"
      >
        {/* Load older messages button */}
        {hasMoreOlder && (
          <div className="text-center pt-1 pb-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onLoadOlder}
              disabled={isLoadingOlder}
              className="text-xs h-7 px-3 text-neutral-600 bg-white shadow-xs border border-neutral-200"
            >
              {isLoadingOlder ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  Loading history...
                </>
              ) : (
                'Load older messages'
              )}
            </Button>
          </div>
        )}

        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600 mb-2" />
            <span className="text-xs">Loading message history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mb-2">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-neutral-800">No messages yet</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Be the first to break the ice and start the discussion!
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderUserId === user?.id;
            const isDeleted = msg.isDeleted;
            const senderName = msg.sender
              ? `${msg.sender.firstName} ${msg.sender.lastName}`
              : isMe
              ? 'You'
              : 'Team Member';
            const initials = msg.sender
              ? `${msg.sender.firstName[0] || ''}${msg.sender.lastName[0] || ''}`.toUpperCase()
              : 'U';

            // Show date separator when date changes between messages
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateSeparator =
              !prevMsg ||
              new Date(prevMsg.createdAt).toDateString() !==
                new Date(msg.createdAt).toDateString();

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-[11px] font-semibold text-neutral-500 shadow-2xs">
                      {formatMessageDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  className={`group relative flex items-start gap-3 py-1 px-2 rounded-xl transition-colors hover:bg-neutral-100/60 ${
                    isMe ? 'flex-row-reverse' : ''
                  }`}
                >
                  {/* Sender Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full font-semibold text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                      isMe
                        ? 'bg-brand-600 text-white'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {initials}
                  </div>

                  {/* Message Bubble & Content */}
                  <div
                    className={`flex flex-col max-w-[75%] min-w-[120px] ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* Header info */}
                    <div
                      className={`flex items-center gap-1.5 mb-1 text-[11px] text-neutral-400 ${
                        isMe ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <span className="font-semibold text-neutral-800">{senderName}</span>
                      <span>•</span>
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {msg.isEdited && !isDeleted && (
                        <span className="italic text-neutral-400 text-[10px]">(edited)</span>
                      )}
                    </div>

                    {/* Replied Message Banner */}
                    {msg.replyTo && (
                      <div
                        className={`mb-1 p-2 rounded-lg text-xs border border-neutral-200/80 bg-neutral-100/80 text-neutral-600 flex items-start gap-1.5 max-w-full ${
                          isMe ? 'rounded-br-xs' : 'rounded-bl-xs'
                        }`}
                      >
                        <CornerDownRight className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-semibold text-neutral-700 block text-[11px]">
                            {msg.replyTo.senderName || 'Replied message'}
                          </span>
                          <span className="truncate block text-neutral-500">
                            {msg.replyTo.content}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Message Body or Inline Edit */}
                    {editingMessageId === msg.id ? (
                      <div className="w-full bg-white p-3 rounded-xl border border-brand-300 shadow-sm space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full text-xs text-neutral-900 border-none focus:outline-none resize-none min-h-[50px]"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingMessageId(null)}
                            disabled={isSubmittingEdit}
                            className="h-6 px-2 text-[11px]"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(msg.id)}
                            disabled={isSubmittingEdit || !editContent.trim()}
                            className="h-6 px-2 text-[11px] bg-brand-600 hover:bg-brand-700"
                          >
                            {isSubmittingEdit ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs ${
                          isDeleted
                            ? 'bg-neutral-100 text-neutral-400 italic border border-neutral-200/60'
                            : isMe
                            ? 'bg-brand-600 text-white rounded-tr-xs'
                            : 'bg-white text-neutral-900 border border-neutral-200/80 rounded-tl-xs'
                        }`}
                      >
                        {msg.content}
                      </div>
                    )}

                    {/* Reactions Display */}
                    {!isDeleted && msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {msg.reactions.map((r) => {
                          return (
                            <button
                              key={r.reaction}
                              onClick={() => {
                                if (r.hasReacted) {
                                  onRemoveReaction(msg.id, r.reaction);
                                } else {
                                  onReactMessage(msg.id, r.reaction);
                                }
                              }}
                              title={r.users.map((u) => u.name).join(', ')}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                r.hasReacted
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold'
                                  : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                              }`}
                            >
                              <span>{r.reaction}</span>
                              <span className="text-[11px] font-medium">{r.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Message Action Toolbar on Hover */}
                  {!isDeleted && editingMessageId !== msg.id && (
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-neutral-200 rounded-lg p-0.5 shadow-sm absolute top-0 ${
                        isMe ? 'left-4' : 'right-4'
                      }`}
                    >
                      {/* Emoji trigger */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActiveReactionPickerMessageId(
                              activeReactionPickerMessageId === msg.id ? null : msg.id
                            )
                          }
                          title="React"
                          className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800"
                        >
                          <Smile className="w-3.5 h-3.5" />
                        </button>

                        {/* Reaction Picker Popover */}
                        {activeReactionPickerMessageId === msg.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setActiveReactionPickerMessageId(null)}
                            />
                            <div className="absolute top-8 left-0 z-40 bg-white border border-neutral-200 rounded-xl shadow-lg p-1.5 flex items-center gap-1">
                              {COMMON_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => {
                                    onReactMessage(msg.id, emoji);
                                    setActiveReactionPickerMessageId(null);
                                  }}
                                  className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-sm transition-transform hover:scale-120"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Reply button */}
                      <button
                        onClick={() => {
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        title="Reply"
                        className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800"
                      >
                        <CornerDownRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit button */}
                      {canManageMessage(msg) && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          title="Edit"
                          className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete button */}
                      {canManageMessage(msg) && (
                        <button
                          onClick={() => setDeletingMessageId(msg.id)}
                          title="Delete"
                          className="p-1 rounded hover:bg-neutral-100 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Delete Confirmation Modal for this message */}
                  {deletingMessageId === msg.id && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
                        <h4 className="font-semibold text-sm text-neutral-900">Delete Message?</h4>
                        <p className="text-xs text-neutral-500">
                          This will soft-delete the message. The content will be masked for all members while retaining audit history.
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeletingMessageId(null)}
                            disabled={isDeleting}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(msg.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Preview Bar */}
      {replyingTo && (
        <div className="px-6 py-2 bg-brand-50/70 border-t border-brand-100 flex items-center justify-between text-xs text-brand-900">
          <div className="flex items-center gap-2 truncate">
            <CornerDownRight className="w-3.5 h-3.5 text-brand-600 shrink-0" />
            <span className="font-semibold">
              Replying to {replyingTo.sender?.firstName || 'Message'}:
            </span>
            <span className="text-brand-700 truncate max-w-md">{replyingTo.content}</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-brand-500 hover:text-brand-800 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Composer */}
      <div className="p-4 bg-white border-t border-neutral-200">
        <form onSubmit={handleSend} className="relative flex items-end gap-2">
          <div className="flex-1 relative bg-neutral-50 border border-neutral-300 rounded-xl focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
            <textarea
              ref={inputRef}
              rows={2}
              placeholder={`Message ${
                conversation.type === 'CHANNEL' ? '#' + conversation.name : conversation.name
              }... (Enter to send, Shift+Enter for new line)`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={5000}
              disabled={isSending}
              className="w-full px-3 py-2.5 text-xs sm:text-sm text-neutral-900 bg-transparent border-none focus:outline-none resize-none leading-relaxed placeholder:text-neutral-400"
            />

            <div className="px-3 pb-1.5 flex items-center justify-between text-[11px] text-neutral-400 select-none">
              <span>{content.length > 4000 ? `${content.length}/5000` : ''}</span>
              <span className="hidden sm:inline">Enter ↵ to send</span>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSending || !content.trim()}
            className="h-10 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs shrink-0 self-end"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
