import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Project, ProjectMember, ProjectRole } from '@/types/project';
import type { Task, TaskListResponse } from '@/types/task';
import type { Employee, EmployeeListResponse } from '@/types/employee';
import { ProjectModal } from './project-modal';
import { TaskModal } from '../tasks/task-modal';
import { TaskDetailModal } from '../tasks/task-detail-modal';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Kanban,
  Edit2,
  Trash2,
  Users,
  Plus,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  AlertCircle,
  Loader2,
  ListTodo,
  ExternalLink,
  Shield,
  UserMinus,
} from 'lucide-react';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tenantEmployees, setTenantEmployees] = useState<Array<{ id: string; name: string; employeeCode: string }>>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Add Member state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('MEMBER');
  const [memberLoading, setMemberLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchProjectData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch project details
      const proj = await api.get<Project>(`/api/v1/projects/${id}`);
      setProject(proj);

      // 2. Fetch project members
      const memberList = await api.get<ProjectMember[]>(`/api/v1/projects/${id}/members`);
      setMembers(extractItems<ProjectMember>(memberList));

      // 3. Fetch project tasks
      const taskRes = await api.get<TaskListResponse>(`/api/v1/tasks?projectId=${id}&pageSize=50`);
      setTasks(extractItems<Task>(taskRes));
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load project details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProjectData();

    // Load tenant employees for the add-member dropdown
    api
      .get<EmployeeListResponse>('/api/v1/employees?pageSize=100')
      .then((res) => {
        const items = extractItems<Employee>(res);
        setTenantEmployees(
          items.map((emp) => ({
            id: emp.id,
            name: `${emp.firstName} ${emp.lastName}`,
            employeeCode: emp.employeeCode,
          }))
        );
      })
      .catch(() => {});
  }, [fetchProjectData]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedEmployeeId) return;

    setMemberLoading(true);
    setErrorMessage(null);

    try {
      await api.post(`/api/v1/projects/${id}/members`, {
        employeeId: selectedEmployeeId,
        projectRole: selectedRole,
      });
      setSuccessMessage('Member added to project successfully.');
      setIsAddMemberOpen(false);
      setSelectedEmployeeId('');
      fetchProjectData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add member to project.');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleRemoveMember = async (employeeId: string) => {
    if (!id) return;
    try {
      await api.delete(`/api/v1/projects/${id}/members/${employeeId}`);
      setSuccessMessage('Member removed from project.');
      fetchProjectData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove member.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
        <h2 className="text-lg font-semibold text-white">Project Not Found</h2>
        <p className="mt-1 text-sm">The project requested could not be located.</p>
        <Button onClick={() => navigate('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  const progress = project.taskStats?.progressPercentage ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/projects')}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Projects
          </Button>
          <span className="font-mono text-sm px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400">
            {project.projectCode}
          </span>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate(`/projects/${project.id}/board`)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Kanban className="h-4 w-4" />
            Kanban Board
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsProjectModalOpen(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Project Metadata */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Project Overview
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            {project.description || 'No description provided for this project.'}
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800 sm:grid-cols-4">
            <div>
              <span className="text-xs text-slate-500">Status</span>
              <div className="mt-1">
                <span className="font-semibold text-sm text-white">{project.status}</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Priority</span>
              <div className="mt-1">
                <span className="font-semibold text-sm text-white">{project.priority}</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Owner</span>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {project.owner
                    ? `${project.owner.firstName} ${project.owner.lastName}`
                    : 'Unassigned'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Department</span>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span>{project.department?.name || 'None'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <div>
              <span className="text-xs text-slate-500">Start Date</span>
              <div className="mt-1 text-sm text-slate-300">
                {project.startDate
                  ? new Date(project.startDate).toLocaleDateString()
                  : 'Not specified'}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Target Due Date</span>
              <div className="mt-1 text-sm text-slate-300">
                {project.dueDate
                  ? new Date(project.dueDate).toLocaleDateString()
                  : 'Not specified'}
              </div>
            </div>
          </div>
        </div>

        {/* Task Progress & Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Task Progress
          </h2>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-extrabold text-white">{progress}%</span>
              <span className="text-xs text-slate-400 ml-2">completed</span>
            </div>
            <span className="text-xs text-slate-400">
              {project.taskStats?.completed ?? 0} of {project.taskStats?.total ?? 0} tasks
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Backlog / To Do</span>
              <span>
                {(project.taskStats?.breakdown?.['BACKLOG'] || 0) +
                  (project.taskStats?.breakdown?.['TODO'] || 0)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>In Progress / Review</span>
              <span>
                {(project.taskStats?.breakdown?.['IN_PROGRESS'] || 0) +
                  (project.taskStats?.breakdown?.['IN_REVIEW'] || 0)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Blocked</span>
              <span>{project.taskStats?.breakdown?.['BLOCKED'] || 0}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-medium">
              <span>Completed</span>
              <span>{project.taskStats?.breakdown?.['COMPLETED'] || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Project Members Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Project Members</h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {members.length}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setIsAddMemberOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Member
          </Button>
        </div>

        {isAddMemberOpen && (
          <form
            onSubmit={handleAddMember}
            className="rounded-lg border border-slate-700 bg-slate-800/80 p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Add Employee to Project Team
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                  required
                >
                  <option value="">Select Employee...</option>
                  {tenantEmployees
                    .filter((emp) => !members.some((m) => m.employeeId === emp.id))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeCode})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                >
                  <option value="MEMBER">Member</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddMemberOpen(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={memberLoading || !selectedEmployeeId}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {memberLoading ? 'Adding...' : 'Add to Team'}
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 font-semibold text-xs border border-blue-500/20">
                  {m.employee.firstName[0]}
                  {m.employee.lastName[0]}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">
                    {m.employee.firstName} {m.employee.lastName}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="font-mono text-slate-500">{m.employee.employeeCode}</span>
                    <span>•</span>
                    <span className="text-blue-400">{m.projectRole}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveMember(m.employeeId)}
                title="Remove Member"
                className="h-7 px-2 text-slate-400 hover:text-red-400 hover:bg-slate-700"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Project Tasks Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Project Tasks</h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {tasks.length}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setIsTaskModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Task</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Assignee</th>
                <th className="py-2.5 px-3">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No tasks created for this project yet.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400 bg-slate-800 px-1 py-0.5 rounded text-[11px]">
                          {task.taskCode}
                        </span>
                        <span className="font-medium text-white">{task.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium">{task.status}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium">{task.priority}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      {task.assignee ? (
                        <span>
                          {task.assignee.firstName} {task.assignee.lastName}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Project Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage('Project updated.');
          fetchProjectData();
          setTimeout(() => setSuccessMessage(null), 4000);
        }}
        projectToEdit={project}
      />

      {/* Create Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage('Task created.');
          fetchProjectData();
          setTimeout(() => setSuccessMessage(null), 4000);
        }}
        defaultProjectId={project.id}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask.id}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={() => fetchProjectData()}
        />
      )}
    </div>
  );
}
