import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Task, TaskStatus, TaskPriority, CreateTaskPayload, UpdateTaskPayload } from '@/types/task';
import type { Project, ProjectListResponse, ProjectMember } from '@/types/project';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import { X, AlertCircle } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskToEdit?: Task | null;
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
}

export function TaskModal({
  isOpen,
  onClose,
  onSuccess,
  taskToEdit,
  defaultProjectId,
  defaultStatus,
}: TaskModalProps) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [taskCode, setTaskCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus || 'TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState('');
  const [reporterEmployeeId, setReporterEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [projects, setProjects] = useState<Array<{ id: string; name: string; projectCode: string }>>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [allEmployees, setAllEmployees] = useState<Array<{ id: string; name: string; employeeCode: string }>>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load project list and employees
  useEffect(() => {
    if (isOpen) {
      api
        .get<ProjectListResponse>('/api/v1/projects?pageSize=100')
        .then((res) => {
          const items = extractItems<Project>(res);
          setProjects(items.map((p) => ({ id: p.id, name: p.name, projectCode: p.projectCode })));
        })
        .catch(() => {});

      api
        .get<EmployeeListResponse>('/api/v1/employees?pageSize=100')
        .then((res) => {
          const items = extractItems<Employee>(res);
          setAllEmployees(
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

  // When projectId changes, load its project members for assignee selection
  useEffect(() => {
    const targetProject = projectId || defaultProjectId;
    if (targetProject) {
      api
        .get<ProjectMember[]>(`/api/v1/projects/${targetProject}/members`)
        .then((members) => {
          setProjectMembers(members);
        })
        .catch(() => {
          setProjectMembers([]);
        });
    } else {
      setProjectMembers([]);
    }
  }, [projectId, defaultProjectId]);

  useEffect(() => {
    if (taskToEdit) {
      setProjectId(taskToEdit.projectId);
      setTaskCode(taskToEdit.taskCode);
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setStatus(taskToEdit.status);
      setPriority(taskToEdit.priority);
      setAssigneeEmployeeId(taskToEdit.assigneeEmployeeId || '');
      setReporterEmployeeId(taskToEdit.reporterEmployeeId || '');
      setStartDate(
        taskToEdit.startDate
          ? new Date(taskToEdit.startDate).toISOString().split('T')[0]
          : ''
      );
      setDueDate(
        taskToEdit.dueDate
          ? new Date(taskToEdit.dueDate).toISOString().split('T')[0]
          : ''
      );
    } else {
      setProjectId(defaultProjectId || '');
      setTaskCode('');
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || 'TODO');
      setPriority('MEDIUM');
      setAssigneeEmployeeId('');
      setReporterEmployeeId('');
      setStartDate('');
      setDueDate('');
    }
    setErrorMessage(null);
  }, [taskToEdit, defaultProjectId, defaultStatus, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!projectId) {
      setErrorMessage('Please select a project.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Task title is required.');
      return;
    }

    if (!taskToEdit && !taskCode.trim()) {
      setErrorMessage('Task code is required.');
      return;
    }

    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      setErrorMessage('Due date cannot be earlier than start date.');
      return;
    }

    setIsLoading(true);

    try {
      if (taskToEdit) {
        const payload: UpdateTaskPayload = {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          assigneeEmployeeId: assigneeEmployeeId || null,
          reporterEmployeeId: reporterEmployeeId || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
        };
        await api.put(`/api/v1/tasks/${taskToEdit.id}`, payload);
      } else {
        const payload: CreateTaskPayload = {
          projectId,
          taskCode: taskCode.trim().toUpperCase(),
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          assigneeEmployeeId: assigneeEmployeeId || null,
          reporterEmployeeId: reporterEmployeeId || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
        };
        await api.post('/api/v1/tasks', payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to save task.');
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
            {taskToEdit ? 'Edit Task' : 'Create New Task'}
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
                Project <span className="text-red-400">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!!taskToEdit || !!defaultProjectId}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white disabled:opacity-60 focus:border-blue-500 focus:outline-none"
                required
              >
                <option value="">Select Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.projectCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Task Code <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={taskCode}
                onChange={(e) => setTaskCode(e.target.value.toUpperCase())}
                placeholder="e.g. TSK-101"
                disabled={!!taskToEdit}
                className="mt-1 bg-slate-800 border-slate-700 text-white uppercase placeholder:text-slate-500 disabled:opacity-60"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Task Title <span className="text-red-400">*</span>
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Web Crypto JWT verification"
              className="mt-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide implementation details, acceptance criteria, or repro steps..."
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="BACKLOG">Backlog</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
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
              <label className="block text-xs font-medium text-slate-300">
                Assignee (Project Member)
              </label>
              <select
                value={assigneeEmployeeId}
                onChange={(e) => setAssigneeEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {projectMembers.map((m) => (
                  <option key={m.employeeId} value={m.employeeId}>
                    {m.employee.firstName} {m.employee.lastName} ({m.employee.employeeCode})
                  </option>
                ))}
              </select>
              {projectMembers.length === 0 && projectId && (
                <p className="mt-1 text-[11px] text-amber-400">
                  No members added to this project yet. Add members in the project details.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Reporter</label>
              <select
                value={reporterEmployeeId}
                onChange={(e) => setReporterEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Reporter (Optional)</option>
                {allEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeCode})
                  </option>
                ))}
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
              {isLoading ? 'Saving...' : taskToEdit ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
