import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import { communicationApi } from '../api/communication-api';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import type { Conversation } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Users, Search, AlertCircle, Loader2, Check } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversation: Conversation) => void;
}

export function CreateGroupModal({ isOpen, onClose, onSuccess }: CreateGroupModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedUserIds([]);
      setSearch('');
      setErrorMessage(null);
      setIsLoading(true);

      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100&status=ACTIVE')
        .then((res) => {
          const items = extractItems<Employee>(res);
          const valid = items.filter(
            (emp) => emp.userId && emp.userId !== user?.id
          );
          setEmployees(valid);
        })
        .catch((err) => {
          setErrorMessage(err.message || 'Failed to load team members.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const email = (emp.workEmail || '').toLowerCase();
    const query = search.toLowerCase().trim();
    return fullName.includes(query) || email.includes(query);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Group name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const conv = await communicationApi.createConversation({
        type: 'GROUP',
        name: name.trim(),
        description: description.trim() || undefined,
        participantUserIds: selectedUserIds,
      });
      onSuccess(conv);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create group conversation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Create Group Conversation</h3>
              <p className="text-xs text-neutral-500">Collaborate with multiple team members</p>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-5 space-y-4">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
                Group Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Design Sync, Marketing Sprint"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
                Description (Optional)
              </label>
              <Input
                type="text"
                placeholder="Brief purpose of this group discussion..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Select Members ({selectedUserIds.length} selected)
                </label>
              </div>

              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  type="text"
                  placeholder="Filter team members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-xs py-1.5 h-8"
                />
              </div>

              <div className="border border-neutral-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-neutral-100 p-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-neutral-400">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-600 mr-2" />
                    <span className="text-xs">Loading members...</span>
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="py-4 text-center text-xs text-neutral-400">
                    No team members found.
                  </div>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isSelected = emp.userId ? selectedUserIds.includes(emp.userId) : false;
                    const initials = `${emp.firstName[0] || ''}${emp.lastName[0] || ''}`.toUpperCase();
                    return (
                      <div
                        key={emp.id}
                        onClick={() => emp.userId && toggleUserSelection(emp.userId)}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          isSelected ? 'bg-brand-50/70' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold text-[11px] flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-neutral-900 truncate">
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {emp.jobTitle || emp.workEmail || 'Employee'}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-brand-600 border-brand-600 text-white'
                              : 'border-neutral-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2 mt-auto">
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
                'Create Group'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
