import React, { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Task, TaskListResponse, TaskStatus, TaskPriority } from '@/types/task';
import type { Project, ProjectListResponse } from '@/types/project';
import type { EmployeeListResponse } from '@/types/employee';
import { TaskModal } from './task-modal';
import { TaskDetailModal } from './task-detail-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ListTodo,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FolderKanban,
} from 'lucide-react';

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const [projects, setProjects] = useState<Array<{ id: string; name: string; projectCode: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Delete dialog
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (projectFilter !== 'ALL') params.append('projectId', projectFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);

      const res = await api.get<TaskListResponse>(`/api/v1/tasks?${params.toString()}`);
      setTasks(extractItems<Task>(res));
      setTotal(res?.total ?? 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load tasks.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, search, projectFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    api
      .get<ProjectListResponse>('/api/v1/projects?pageSize=100')
      .then((res) => {
        const items = extractItems<Project>(res);
        setProjects(items.map((p) => ({ id: p.id, name: p.name, projectCode: p.projectCode })));
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deletingTask) return;
    setDeleteLoading(true);
    setErrorMessage(null);

    try {
      await api.delete(`/api/v1/tasks/${deletingTask.id}`);
      setSuccessMessage(`Task '${deletingTask.title}' was successfully deleted.`);
      setDeletingTask(null);
      fetchTasks();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete task.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'BACKLOG':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">Backlog</span>;
      case 'TODO':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">To Do</span>;
      case 'IN_PROGRESS':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">In Progress</span>;
      case 'IN_REVIEW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">In Review</span>;
      case 'BLOCKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">Blocked</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Completed</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">Cancelled</span>;
      default:
        return <span className="text-xs text-slate-300">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'URGENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">Urgent</span>;
      case 'HIGH':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">High</span>;
      case 'MEDIUM':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Medium</span>;
      case 'LOW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">Low</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ListTodo className="h-6 w-6 text-blue-400" />
            Task Management
          </h1>
          <p className="text-sm text-slate-400">
            Track individual work items, assign tasks, prioritize sprints, and manage delivery dates.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTask(null);
            setIsCreateModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Button>
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search tasks by title or code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Project:</span>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none max-w-[160px] truncate"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="BACKLOG">Backlog</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3.5 px-4">Task</th>
                <th className="py-3.5 px-4">Project</th>
                <th className="py-3.5 px-4">Assignee</th>
                <th className="py-3.5 px-4">Priority</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500" />
                    <p className="mt-2 text-xs">Loading tasks...</p>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ListTodo className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                    <p className="text-sm font-medium">No tasks found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {search || statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                        ? 'Try adjusting your filters.'
                        : 'Create your first task to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const isOverdue =
                    task.dueDate &&
                    new Date(task.dueDate).getTime() < Date.now() &&
                    task.status !== 'COMPLETED';

                  return (
                    <tr key={task.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400">
                            {task.taskCode}
                          </span>
                          <span
                            onClick={() => setSelectedTaskId(task.id)}
                            className="font-medium text-white hover:text-blue-400 cursor-pointer hover:underline"
                          >
                            {task.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {task.project ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-300">
                            <FolderKanban className="h-3.5 w-3.5 text-slate-500" />
                            <span>{task.project.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {task.assignee ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-300">
                            <User className="h-3.5 w-3.5 text-slate-500" />
                            <span>
                              {task.assignee.firstName} {task.assignee.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{getPriorityBadge(task.priority)}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(task.status)}</td>
                      <td className="py-3.5 px-4 text-xs">
                        {task.dueDate ? (
                          <div
                            className={`flex items-center gap-1.5 ${
                              isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400'
                            }`}
                          >
                            {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No deadline</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTaskId(task.id)}
                            title="View Task Details"
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTask(task);
                              setIsCreateModalOpen(true);
                            }}
                            title="Edit Task"
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingTask(task)}
                            title="Delete Task"
                            className="h-8 px-2 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
            <div>
              Showing <span className="font-medium text-white">{tasks.length}</span> of{' '}
              <span className="font-medium text-white">{total}</span> tasks
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 border-slate-700 text-xs"
              >
                Previous
              </Button>
              <span className="px-2 text-slate-300">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 border-slate-700 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-semibold text-white">Delete Task</h3>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              Are you sure you want to delete task{' '}
              <strong className="text-white">
                {deletingTask.title} ({deletingTask.taskCode})
              </strong>
              ?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeletingTask(null)}
                disabled={deleteLoading}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Task'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Task Modal */}
      <TaskModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingTask(null);
        }}
        onSuccess={() => {
          setSuccessMessage(editingTask ? 'Task updated.' : 'Task created.');
          fetchTasks();
          setTimeout(() => setSuccessMessage(null), 4000);
        }}
        taskToEdit={editingTask}
      />

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={() => fetchTasks()}
        />
      )}
    </div>
  );
}
