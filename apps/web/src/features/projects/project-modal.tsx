import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type {
  Project,
  ProjectStatus,
  ProjectPriority,
  CreateProjectPayload,
  UpdateProjectPayload,
} from '@/types/project';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import type { Department, DepartmentListResponse } from '@/types/department';
import { X, AlertCircle, Calendar } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectToEdit?: Project | null;
}

export function ProjectModal({
  isOpen,
  onClose,
  onSuccess,
  projectToEdit,
}: ProjectModalProps) {
  const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [ownerEmployeeId, setOwnerEmployeeId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [status, setStatus] = useState<ProjectStatus>('PLANNING');
  const [priority, setPriority] = useState<ProjectPriority>('MEDIUM');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [employees, setEmployees] = useState<Array<{ id: string; name: string; employeeCode: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100')
        .then((res) => {
          const items = extractItems<Employee>(res);
          setEmployees(
            items.map((emp) => ({
              id: emp.id,
              name: `${emp.firstName} ${emp.lastName}`,
              employeeCode: emp.employeeCode,
            }))
          );
        })
        .catch(() => {});

      api
        .get<DepartmentListResponse>('/api/v1/departments?pageSize=100')
        .then((res) => {
          const items = extractItems<Department>(res);
          setDepartments(
            items.map((dept) => ({
              id: dept.id,
              name: dept.name,
              code: dept.code,
            }))
          );
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (projectToEdit) {
      setName(projectToEdit.name);
      setProjectCode(projectToEdit.projectCode);
      setDescription(projectToEdit.description || '');
      setOwnerEmployeeId(projectToEdit.ownerEmployeeId || '');
      setDepartmentId(projectToEdit.departmentId || '');
      setStatus(projectToEdit.status);
      setPriority(projectToEdit.priority);
      setStartDate(
        projectToEdit.startDate
          ? new Date(projectToEdit.startDate).toISOString().split('T')[0]
          : ''
      );
      setDueDate(
        projectToEdit.dueDate
          ? new Date(projectToEdit.dueDate).toISOString().split('T')[0]
          : ''
      );
    } else {
      setName('');
      setProjectCode('');
      setDescription('');
      setOwnerEmployeeId('');
      setDepartmentId('');
      setStatus('PLANNING');
      setPriority('MEDIUM');
      setStartDate('');
      setDueDate('');
    }
    setErrorMessage(null);
  }, [projectToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Project name is required.');
      return;
    }

    if (!projectToEdit && !projectCode.trim()) {
      setErrorMessage('Project code is required.');
      return;
    }

    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      setErrorMessage('Due date cannot be earlier than start date.');
      return;
    }

    setIsLoading(true);

    try {
      if (projectToEdit) {
        const payload: UpdateProjectPayload = {
          name: name.trim(),
          description: description.trim() || null,
          ownerEmployeeId: ownerEmployeeId || null,
          departmentId: departmentId || null,
          status,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
        };
        await api.put(`/api/v1/projects/${projectToEdit.id}`, payload);
      } else {
        const payload: CreateProjectPayload = {
          name: name.trim(),
          projectCode: projectCode.trim().toUpperCase(),
          description: description.trim() || null,
          ownerEmployeeId: ownerEmployeeId || null,
          departmentId: departmentId || null,
          status,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
        };
        await api.post('/api/v1/projects', payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to save project. Please check your inputs.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-semibold text-white">
            {projectToEdit ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Project Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cloudflare Edge Migration"
                className="mt-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Project Code <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
                placeholder="e.g. PRJ-MIG-01"
                disabled={!!projectToEdit}
                className="mt-1 bg-slate-800 border-slate-700 text-white uppercase placeholder:text-slate-500 disabled:opacity-60"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline project scope, objectives and deliverables..."
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Project Owner</label>
              <select
                value={ownerEmployeeId}
                onChange={(e) => setOwnerEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Project Owner</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">No Department Assigned</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="PLANNING">Planning</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Due Date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? 'Saving...' : projectToEdit ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
