import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import { communicationApi } from '../api/communication-api';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import type { Conversation } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, User, AlertCircle, Loader2 } from 'lucide-react';

interface NewDirectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversation: Conversation) => void;
}

export function NewDirectModal({ isOpen, onClose, onSuccess }: NewDirectModalProps) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setErrorMessage(null);
      setSearch('');
      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100&status=ACTIVE')
        .then((res) => {
          const items = extractItems<Employee>(res);
          // Filter to employees with a valid linked user account that is not the current user
          const valid = items.filter(
            (emp) => emp.userId && emp.userId !== user?.id
          );
          setEmployees(valid);
        })
        .catch((err) => {
          setErrorMessage(err.message || 'Failed to load employees list.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const email = (emp.workEmail || '').toLowerCase();
    const query = search.toLowerCase().trim();
    return fullName.includes(query) || email.includes(query);
  });

  const handleStartChat = async (targetUserId: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const conv = await communicationApi.createConversation({
        type: 'DIRECT',
        participantUserIds: [targetUserId],
      });
      onSuccess(conv);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to start direct conversation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">New Direct Message</h3>
              <p className="text-xs text-neutral-500">Select a team member to start a conversation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-neutral-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search team members by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Employee List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-brand-600" />
              <span className="text-xs">Loading team members...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              {search.trim() ? 'No matching team members found.' : 'No available team members.'}
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const initials = `${emp.firstName[0] || ''}${emp.lastName[0] || ''}`.toUpperCase();
              return (
                <button
                  key={emp.id}
                  disabled={isSubmitting}
                  onClick={() => emp.userId && handleStartChat(emp.userId)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {emp.jobTitle || emp.workEmail || 'Employee'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-brand-600 font-medium shrink-0 ml-2">Chat</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
