import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Department, CreateDepartmentPayload, UpdateDepartmentPayload } from '@/types/department';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import { X, AlertCircle } from 'lucide-react';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  departmentToEdit?: Department | null;
}

export function DepartmentModal({
  isOpen,
  onClose,
  onSuccess,
  departmentToEdit,
}: DepartmentModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [departmentHeadId, setDepartmentHeadId] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [eligibleEmployees, setEligibleEmployees] = useState<
    Array<{ id: string; name: string; employeeCode: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load eligible employees for department head dropdown
  useEffect(() => {
    if (isOpen) {
      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100')
        .then((res) => {
          const items = extractItems<Employee>(res);
          setEligibleEmployees(
            items.map((emp) => ({
              id: emp.id,
              name: `${emp.firstName} ${emp.lastName}`,
              employeeCode: emp.employeeCode,
            }))
          );
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (departmentToEdit) {
      setName(departmentToEdit.name);
      setCode(departmentToEdit.code);
      setDescription(departmentToEdit.description || '');
      setDepartmentHeadId(departmentToEdit.departmentHeadId || '');
      setStatus(departmentToEdit.status);
    } else {
      setName('');
      setCode('');
      setDescription('');
      setDepartmentHeadId('');
      setStatus('ACTIVE');
    }
    setErrorMessage(null);
  }, [departmentToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !code.trim()) {
      setErrorMessage('Please provide both a department name and code.');
      return;
    }

    setIsLoading(true);
    try {
      if (departmentToEdit) {
        const payload: UpdateDepartmentPayload = {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || null,
          departmentHeadId: departmentHeadId || null,
          status,
        };
        await api.patch(`/api/v1/departments/${departmentToEdit.id}`, payload);
      } else {
        const payload: CreateDepartmentPayload = {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || undefined,
          departmentHeadId: departmentHeadId || null,
          status,
        };
        await api.post('/api/v1/departments', payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to save department. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">
            {departmentToEdit ? 'Edit Department' : 'Create New Department'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 rounded-lg p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Department Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engineering, Human Resources, Design"
            required
            disabled={isLoading}
          />

          <Input
            label="Department Code *"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ENG, HR, DES"
            helperText="Unique code identifier within this workspace (uppercase)"
            required
            disabled={isLoading}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Department Head (Optional)
            </label>
            <select
              value={departmentHeadId}
              onChange={(e) => setDepartmentHeadId(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-lg py-2 px-3 text-sm text-neutral-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-neutral-50"
              disabled={isLoading}
            >
              <option value="">-- No Department Head Assigned --</option>
              {eligibleEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of department scope and operations..."
              className="w-full bg-white border border-neutral-300 rounded-lg p-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-neutral-50"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Status
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="ACTIVE"
                  checked={status === 'ACTIVE'}
                  onChange={() => setStatus('ACTIVE')}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="INACTIVE"
                  checked={status === 'INACTIVE'}
                  onChange={() => setStatus('INACTIVE')}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Inactive
              </label>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
            >
              {departmentToEdit ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
