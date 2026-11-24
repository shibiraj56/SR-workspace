import React, { useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import type {
  Conversation,
  ConversationMember,
} from '@/types/communication';
import { Button } from '@/components/ui/button';
import {
  X,
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  User,
  Bell,
  BellOff,
  Archive,
  LogOut,
  FolderKanban,
  Hash,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface DetailsPanelProps {
  conversation: Conversation;
  members: ConversationMember[];
  isLoadingMembers: boolean;
  onClose: () => void;
  onOpenAddMember: () => void;
  onRemoveMember: (userId: string) => Promise<void>;
  onToggleMute: () => Promise<void>;
  onArchiveConversation: (archive: boolean) => Promise<void>;
}

export function DetailsPanel({
  conversation,
  members,
  isLoadingMembers,
  onClose,
  onOpenAddMember,
  onRemoveMember,
  onToggleMute,
  onArchiveConversation,
}: DetailsPanelProps) {
  const { user, roles, permissions } = useAuth();
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOwnerOrAdmin =
    conversation.membership?.role === 'OWNER' ||
    conversation.membership?.role === 'ADMIN' ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('TENANT_ADMIN') ||
    roles.includes('ORG_ADMIN');

  const canManageMembers =
    isOwnerOrAdmin || permissions.includes('communication:manage_members');

  const handleRemove = async (userId: string) => {
    setRemovingUserId(userId);
    setErrorMessage(null);
    try {
      await onRemoveMember(userId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove member.');
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleToggleArchive = async () => {
    setIsArchiving(true);
    setErrorMessage(null);
    try {
      await onArchiveConversation(!conversation.isArchived);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update archive status.');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="w-80 md:w-84 border-l border-neutral-200 bg-white flex flex-col shrink-0 select-none h-full z-10">
      {/* Header */}
      <div className="h-16 px-5 border-b border-neutral-200 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-neutral-900">Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Overview Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                conversation.type === 'DIRECT'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : conversation.type === 'GROUP'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : conversation.type === 'CHANNEL'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {conversation.type}
            </span>
            {conversation.isArchived && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                Archived
              </span>
            )}
          </div>

          <h4 className="font-bold text-base text-neutral-900 leading-tight">
            {conversation.type === 'CHANNEL' && !conversation.name.startsWith('#')
              ? `#${conversation.name}`
              : conversation.name}
          </h4>

          {conversation.description && (
            <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
              {conversation.description}
            </p>
          )}

          {conversation.project && (
            <div className="mt-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-2.5">
              <FolderKanban className="w-4 h-4 text-brand-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Linked Project
                </span>
                <span className="text-xs font-semibold text-neutral-900 truncate block">
                  [{conversation.project.projectCode}] {conversation.project.name}
                </span>
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-neutral-100 text-[11px] text-neutral-400">
            Created on {new Date(conversation.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </div>
        </div>

        {/* Members Section */}
        {conversation.type !== 'DIRECT' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-neutral-500" />
                <h5 className="font-semibold text-xs text-neutral-900 uppercase tracking-wider">
                  Members ({members.length})
                </h5>
              </div>

              {canManageMembers && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenAddMember}
                  className="h-7 px-2 text-xs gap-1 border-neutral-200 text-neutral-700 hover:text-brand-600 hover:border-brand-300"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </Button>
              )}
            </div>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-6 text-neutral-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600 mr-2" />
                Loading members...
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-neutral-400 py-3 text-center">No members listed.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {members.map((m) => {
                  const memberUser = m.user;
                  const fullName = memberUser
                    ? `${memberUser.firstName} ${memberUser.lastName}`
                    : 'Team Member';
                  const initials = memberUser
                    ? `${memberUser.firstName[0] || ''}${memberUser.lastName[0] || ''}`.toUpperCase()
                    : 'U';
                  const isCurrent = m.userId === user?.id;

                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-100"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold text-[11px] flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 truncate">
                            {fullName} {isCurrent && <span className="text-neutral-400 font-normal">(you)</span>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                m.role === 'OWNER'
                                  ? 'bg-purple-50 text-purple-700'
                                  : m.role === 'ADMIN'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-neutral-100 text-neutral-500'
                              }`}
                            >
                              {m.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Remove or Leave Action */}
                      {(isOwnerOrAdmin || isCurrent) && m.role !== 'OWNER' && (
                        <button
                          onClick={() => handleRemove(m.userId)}
                          disabled={removingUserId === m.userId}
                          className="text-[11px] text-neutral-400 hover:text-red-600 p-1 rounded transition-colors"
                          title={isCurrent ? 'Leave conversation' : 'Remove member'}
                        >
                          {removingUserId === m.userId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Settings & Actions Section */}
        <div className="pt-3 border-t border-neutral-100 space-y-2">
          <h5 className="font-semibold text-xs text-neutral-900 uppercase tracking-wider mb-2">
            Preferences & Actions
          </h5>

          {/* Mute Notification Toggle */}
          <button
            onClick={onToggleMute}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors text-xs text-neutral-700 font-medium"
          >
            <div className="flex items-center gap-2">
              {conversation.membership?.isMuted ? (
                <BellOff className="w-4 h-4 text-amber-600" />
              ) : (
                <Bell className="w-4 h-4 text-neutral-500" />
              )}
              <span>{conversation.membership?.isMuted ? 'Muted' : 'Mute Notifications'}</span>
            </div>
            <span className="text-[11px] text-neutral-400">
              {conversation.membership?.isMuted ? 'On' : 'Off'}
            </span>
          </button>

          {/* Archive Toggle (Admin / Owner) */}
          {isOwnerOrAdmin && (
            <button
              onClick={handleToggleArchive}
              disabled={isArchiving}
              className="w-full flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors text-xs text-neutral-700 font-medium"
            >
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-neutral-500" />
                <span>{conversation.isArchived ? 'Unarchive Discussion' : 'Archive Discussion'}</span>
              </div>
              {isArchiving && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
            </button>
          )}

          {/* Leave Conversation (Non-direct) */}
          {conversation.type !== 'DIRECT' && conversation.membership && conversation.membership.role !== 'OWNER' && (
            <button
              onClick={() => user?.id && handleRemove(user.id)}
              disabled={removingUserId === user?.id}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 font-medium text-xs transition-colors"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>Leave Conversation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
