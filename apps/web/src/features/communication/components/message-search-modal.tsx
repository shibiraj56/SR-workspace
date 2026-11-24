import React, { useState } from 'react';
import { communicationApi } from '../api/communication-api';
import type { Message } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, Loader2, MessageSquare, AlertCircle } from 'lucide-react';

interface MessageSearchModalProps {
  isOpen: boolean;
  activeConversationId?: string;
  onClose: () => void;
  onSelectResult: (conversationId: string, messageId: string) => void;
}

export function MessageSearchModal({
  isOpen,
  activeConversationId,
  onClose,
  onSelectResult,
}: MessageSearchModalProps) {
  const [query, setQuery] = useState('');
  const [scopeToCurrent, setScopeToCurrent] = useState(false);
  const [results, setResults] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 2) {
      setErrorMessage('Search query must be at least 2 characters.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setHasSearched(true);
    try {
      const convId = scopeToCurrent ? activeConversationId : undefined;
      const res = await communicationApi.searchMessages(query.trim(), convId);
      setResults(res.items || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to search messages.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Search Messages</h3>
              <p className="text-xs text-neutral-500">Find discussions and information across conversations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="p-4 border-b border-neutral-100 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search message text..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 text-sm"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={isLoading || query.trim().length < 2} size="sm">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {activeConversationId && (
            <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scopeToCurrent}
                onChange={(e) => setScopeToCurrent(e.target.checked)}
                className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Search only in current conversation</span>
            </label>
          )}
        </form>

        {/* Error message */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600 mb-2" />
              <span className="text-xs">Searching messages...</span>
            </div>
          ) : !hasSearched ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              Enter a search keyword to find messages.
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              No matching messages found.
            </div>
          ) : (
            results.map((msg) => {
              const senderName = msg.sender
                ? `${msg.sender.firstName} ${msg.sender.lastName}`
                : 'Team Member';
              const initials = msg.sender
                ? `${msg.sender.firstName[0] || ''}${msg.sender.lastName[0] || ''}`.toUpperCase()
                : 'U';
              const formattedDate = new Date(msg.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    onSelectResult(msg.conversationId, msg.id);
                    onClose();
                  }}
                  className="p-3 border border-neutral-200 rounded-lg hover:border-brand-300 hover:bg-brand-50/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <span className="text-xs font-semibold text-neutral-900">{senderName}</span>
                    </div>
                    <span className="text-[11px] text-neutral-400">{formattedDate}</span>
                  </div>
                  <p className="text-xs text-neutral-700 line-clamp-2 pl-7 font-normal">
                    {msg.isDeleted ? (
                      <span className="italic text-neutral-400">[This message was deleted]</span>
                    ) : (
                      msg.content
                    )}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
          <span>{hasSearched ? `${results.length} result(s)` : 'Type at least 2 characters'}</span>
          <Button variant="secondary" onClick={onClose} size="sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
