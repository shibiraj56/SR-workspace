import React, { useState, useEffect } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import { communicationApi } from '../api/communication-api';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import type { ConversationMember } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, UserPlus, Search, AlertCircle, Loader2 } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  conversationId: string;
  existingMemberUserIds: string[];
  onClose: () => void;
  onSuccess: (newMember: ConversationMember) => void;
}

export function AddMemberModal({
  isOpen,
  conversationId,
  existingMemberUserIds,
  onClose,
  onSuccess,
}: AddMemberModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserId('');
      setRole('MEMBER');
      setSearch('');
      setErrorMessage(null);
      setIsLoading(true);

      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100&status=ACTIVE')
        .then((res) => {
          const items = extractItems<Employee>(res);
          // Filter to employees with userId who are NOT already members
          const candidates = items.filter(
            (emp) => emp.userId && !existingMemberUserIds.includes(emp.userId)
          );
          setEmployees(candidates);
          if (candidates.length > 0 && candidates[0].userId) {
            setSelectedUserId(candidates[0].userId);
          }
        })
        .catch((err) => {
          setErrorMessage(err.message || 'Failed to load team members.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, existingMemberUserIds]);

  if (!isOpen) return null;

  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const email = (emp.workEmail || '').toLowerCase();
    const query = search.toLowerCase().trim();
    return fullName.includes(query) || email.includes(query);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setErrorMessage('Please select a team member to add.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const member = await communicationApi.addMember(conversationId, {
        userId: selectedUserId,
        role,
      });
      onSuccess(member);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to add team member.');
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
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Add Team Member</h3>
              <p className="text-xs text-neutral-500">Invite a member to this conversation</p>
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
              Select Member <span className="text-red-500">*</span>
            </label>

            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                type="text"
                placeholder="Filter members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs py-1.5 h-8"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                Loading members...
              </div>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-xs text-neutral-500 py-3 text-center border border-neutral-200 rounded-lg">
                No eligible team members available to add.
              </p>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                required
              >
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.userId || ''}>
                    {emp.firstName} {emp.lastName} ({emp.jobTitle || emp.workEmail || 'Employee'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Role in Conversation
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}
              className="w-full h-9 px-3 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
            >
              <option value="MEMBER">Member (Can read, write, reply)</option>
              <option value="ADMIN">Admin (Can manage members & settings)</option>
            </select>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedUserId || filteredEmployees.length === 0}
              size="sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Adding...
                </>
              ) : (
                'Add Member'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
