import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Project } from '@/types/project';
import type { Task, TaskStatus, TaskListResponse } from '@/types/task';
import { TaskModal } from '../tasks/task-modal';
import { TaskDetailModal } from '../tasks/task-detail-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Kanban,
  ArrowLeft,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  ArrowRight,
  ArrowLeft as MoveLeft,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface KanbanColumnConfig {
  id: TaskStatus;
  title: string;
  badgeColor: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  { id: 'BACKLOG', title: 'Backlog', badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  { id: 'TODO', title: 'To Do', badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { id: 'IN_PROGRESS', title: 'In Progress', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { id: 'IN_REVIEW', title: 'In Review', badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { id: 'BLOCKED', title: 'Blocked', badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20' },
  { id: 'COMPLETED', title: 'Completed', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
];

export function ProjectBoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>('TODO');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchBoardData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [proj, taskRes] = await Promise.all([
        api.get<Project>(`/api/v1/projects/${id}`),
        api.get<TaskListResponse>(`/api/v1/tasks?projectId=${id}&pageSize=100&sortBy=position&sortOrder=asc`),
      ]);
      setProject(proj);
      setTasks(extractItems<Task>(taskRes));
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load board data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBoardData();
  }, [fetchBoardData]);

  const handleMoveStatus = async (taskId: string, targetStatus: TaskStatus) => {
    // Optimistic update
    const prevTasks = [...tasks];
    setTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
    );

    try {
      await api.patch(`/api/v1/tasks/${taskId}/position`, {
        status: targetStatus,
        position: 0,
      });
      // Refresh to ensure server ordering & stats are in sync
      fetchBoardData();
    } catch (err: any) {
      // Revert on failure
      setTasks(prevTasks);
      setErrorMessage(err.message || 'Failed to update task status.');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const getNextStatus = (current: TaskStatus): TaskStatus | null => {
    const order: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];
    const idx = order.indexOf(current);
    if (idx >= 0 && idx < order.length - 1) return order[idx + 1];
    return null;
  };

  const getPrevStatus = (current: TaskStatus): TaskStatus | null => {
    const order: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];
    const idx = order.indexOf(current);
    if (idx > 0) return order[idx - 1];
    return null;
  };

  const filteredTasks = tasks.filter((t) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchText = `${t.taskCode} ${t.title}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    if (assigneeFilter !== 'ALL' && t.assigneeEmployeeId !== assigneeFilter) {
      return false;
    }
    return true;
  });

  const getPriorityIndicator = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="h-2 w-2 rounded-full bg-red-500" title="Urgent Priority" />;
      case 'HIGH':
        return <span className="h-2 w-2 rounded-full bg-orange-500" title="High Priority" />;
      case 'MEDIUM':
        return <span className="h-2 w-2 rounded-full bg-blue-500" title="Medium Priority" />;
      default:
        return <span className="h-2 w-2 rounded-full bg-slate-500" title="Low Priority" />;
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
        <Button onClick={() => navigate('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      {/* Board Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${project.id}`)}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Project Details
          </Button>
          <span className="font-mono text-sm px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400">
            {project.projectCode}
          </span>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Kanban className="h-5 w-5 text-blue-400" />
            {project.name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <Input
              placeholder="Filter tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <Button
            size="sm"
            onClick={() => {
              setModalDefaultStatus('TODO');
              setIsTaskModalOpen(true);
            }}
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Kanban Board Columns Container */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="inline-flex gap-4 h-full min-w-full">
          {COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className="w-80 flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 px-3.5 py-3 bg-slate-900/90 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{col.title}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[11px] font-mono border ${col.badgeColor}`}
                    >
                      {columnTasks.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setModalDefaultStatus(col.id);
                      setIsTaskModalOpen(true);
                    }}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                    title={`Add task to ${col.title}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Column Task Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {columnTasks.length === 0 ? (
                    <div className="h-28 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 text-slate-600 text-xs">
                      No tasks
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const next = getNextStatus(task.status);
                      const prev = getPrevStatus(task.status);
                      const isOverdue =
                        task.dueDate &&
                        new Date(task.dueDate).getTime() < Date.now() &&
                        task.status !== 'COMPLETED';

                      return (
                        <div
                          key={task.id}
                          className="group rounded-lg border border-slate-800 bg-slate-800/80 p-3 shadow hover:border-slate-700 hover:bg-slate-800 transition-all cursor-pointer"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {/* Card Top */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {getPriorityIndicator(task.priority)}
                              <span className="font-mono text-[11px] text-blue-400">
                                {task.taskCode}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                              {task.priority}
                            </span>
                          </div>

                          {/* Card Title */}
                          <h4 className="mt-1.5 text-xs font-medium text-white line-clamp-2">
                            {task.title}
                          </h4>

                          {/* Card Footer: Assignee & Due Date */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-700/50 pt-2 text-[11px] text-slate-400">
                            <div className="flex items-center gap-1 truncate max-w-[140px]">
                              {task.assignee ? (
                                <>
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold">
                                    {task.assignee.firstName[0]}
                                  </div>
                                  <span className="truncate">
                                    {task.assignee.firstName} {task.assignee.lastName}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-500 italic">Unassigned</span>
                              )}
                            </div>

                            {task.dueDate && (
                              <div
                                className={`flex items-center gap-1 ${
                                  isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400'
                                }`}
                                title={isOverdue ? 'Task is overdue' : 'Due date'}
                              >
                                {isOverdue ? (
                                  <AlertTriangle className="h-3 w-3" />
                                ) : (
                                  <Calendar className="h-3 w-3" />
                                )}
                                <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Movement Controls */}
                          <div
                            className="mt-2 flex items-center justify-between border-t border-slate-700/40 pt-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div>
                              {prev ? (
                                <button
                                  onClick={() => handleMoveStatus(task.id, prev)}
                                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
                                  title={`Move back to ${prev}`}
                                >
                                  <MoveLeft className="h-3 w-3" />
                                  <span>{prev.replace('_', ' ')}</span>
                                </button>
                              ) : (
                                <span />
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {task.status !== 'BLOCKED' && (
                                <button
                                  onClick={() => handleMoveStatus(task.id, 'BLOCKED')}
                                  className="text-[10px] text-red-400 hover:text-red-300"
                                  title="Mark Blocked"
                                >
                                  Block
                                </button>
                              )}
                              {next && (
                                <button
                                  onClick={() => handleMoveStatus(task.id, next)}
                                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                                  title={`Move forward to ${next}`}
                                >
                                  <span>{next.replace('_', ' ')}</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Creation Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSuccess={() => {
          fetchBoardData();
        }}
        defaultProjectId={project.id}
        defaultStatus={modalDefaultStatus}
      />

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={() => fetchBoardData()}
        />
      )}
    </div>
  );
}
