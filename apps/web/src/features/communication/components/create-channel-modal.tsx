import React, { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { communicationApi } from '../api/communication-api';
import type { Conversation } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Hash, AlertCircle, Loader2 } from 'lucide-react';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversation: Conversation) => void;
}

export function CreateChannelModal({ isOpen, onClose, onSuccess }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Channel name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const conv = await communicationApi.createConversation({
        type: 'CHANNEL',
        name: name.trim().replace(/^#+/, ''), // normalize leading hashes
        description: description.trim() || undefined,
      });
      onSuccess(conv);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create channel.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Create Public Channel</h3>
              <p className="text-xs text-neutral-500">Channels are open to all workspace members</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Channel Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 font-semibold text-sm">
                #
              </span>
              <Input
                type="text"
                placeholder="announcements, general, engineering"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="pl-7"
                required
                autoFocus
              />
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Use lowercase alphanumeric names and hyphens.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Topic / Description (Optional)
            </label>
            <Input
              type="text"
              placeholder="What is this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()} size="sm">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                'Create Channel'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
