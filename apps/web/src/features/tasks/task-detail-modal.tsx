import React, { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Task, TaskComment, TaskActivity, TaskStatus, TaskPriority } from '@/types/task';
import { Button } from '@/components/ui/button';
import {
  X,
  MessageSquare,
  History,
  Calendar,
  User,
  AlertCircle,
  Loader2,
  Trash2,
  Send,
  Clock,
  ArrowRight,
  Shield,
  CheckCircle2,
} from 'lucide-react';

interface TaskDetailModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
  onTaskUpdated,
}: TaskDetailModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details');

  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [taskRes, commentsRes, activityRes] = await Promise.all([
        api.get<Task>(`/api/v1/tasks/${taskId}`),
        api.get<TaskComment[]>(`/api/v1/tasks/${taskId}/comments`),
        api.get<TaskActivity[]>(`/api/v1/tasks/${taskId}/activity`),
      ]);
      setTask(taskRes);
      setComments(extractItems<TaskComment>(commentsRes));
      setActivity(extractItems<TaskActivity>(activityRes));
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load task details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen) {
      fetchTaskDetails();
    }
  }, [isOpen, fetchTaskDetails]);

  if (!isOpen) return null;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task) return;
    try {
      await api.patch(`/api/v1/tasks/${task.id}/status`, { status: newStatus });
      fetchTaskDetails();
      onTaskUpdated?.();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update status.');
    }
  };

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    if (!task) return;
    try {
      await api.patch(`/api/v1/tasks/${task.id}/priority`, { priority: newPriority });
      fetchTaskDetails();
      onTaskUpdated?.();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update priority.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !task) return;

    setCommentLoading(true);
    try {
      await api.post(`/api/v1/tasks/${task.id}/comments`, {
        content: newComment.trim(),
      });
      setNewComment('');
      // Refresh comments and activity
      const [freshComments, freshActivity] = await Promise.all([
        api.get<TaskComment[]>(`/api/v1/tasks/${task.id}/comments`),
        api.get<TaskActivity[]>(`/api/v1/tasks/${task.id}/activity`),
      ]);
      setComments(freshComments);
      setActivity(freshActivity);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to post comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!task) return;
    try {
      await api.delete(`/api/v1/tasks/${task.id}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete comment.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex flex-col h-[85vh] w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 shrink-0 bg-slate-900">
          {isLoading || !task ? (
            <div className="h-6 w-48 bg-slate-800 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400 font-semibold">
                {task.taskCode}
              </span>
              <span className="text-xs text-slate-400 font-medium truncate max-w-sm">
                {task.project?.name}
              </span>
            </div>
          )}

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : !task ? (
          <div className="p-8 text-center text-slate-400">Task not found</div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Title & Quick Controls */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/50 shrink-0">
              <h2 className="text-xl font-bold text-white">{task.title}</h2>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Status:</span>
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-white focus:border-blue-500 focus:outline-none"
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

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Priority:</span>
                  <select
                    value={task.priority}
                    onChange={(e) => handlePriorityChange(e.target.value as TaskPriority)}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 px-6 shrink-0 bg-slate-900">
              <button
                onClick={() => setActiveTab('details')}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'details'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Task Details
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'comments'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Comments ({comments.length})
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'activity'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                Activity ({activity.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Description
                    </h3>
                    <p className="mt-2 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {task.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-800 pt-4">
                    <div>
                      <span className="text-xs text-slate-500">Assignee</span>
                      <div className="mt-1 flex items-center gap-2 text-sm text-white font-medium">
                        <User className="h-4 w-4 text-slate-400" />
                        <span>
                          {task.assignee
                            ? `${task.assignee.firstName} ${task.assignee.lastName} (${task.assignee.employeeCode})`
                            : 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">Reporter</span>
                      <div className="mt-1 flex items-center gap-2 text-sm text-white font-medium">
                        <User className="h-4 w-4 text-slate-400" />
                        <span>
                          {task.reporter
                            ? `${task.reporter.firstName} ${task.reporter.lastName}`
                            : 'None'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">Start Date</span>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span>
                          {task.startDate
                            ? new Date(task.startDate).toLocaleDateString()
                            : 'Not set'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">Due Date</span>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span>
                          {task.dueDate
                            ? new Date(task.dueDate).toLocaleDateString()
                            : 'Not set'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {/* Add Comment Form */}
                  <form onSubmit={handleAddComment} className="space-y-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment or technical note..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={commentLoading || !newComment.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {commentLoading ? 'Posting...' : 'Post Comment'}
                      </Button>
                    </div>
                  </form>

                  {/* Comments Feed */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    {comments.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        No comments yet. Start the conversation!
                      </p>
                    ) : (
                      comments.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">
                              {c.author
                                ? `${c.author.firstName} ${c.author.lastName}`
                                : 'Team Member'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">
                                {new Date(c.createdAt).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-slate-500 hover:text-red-400 p-0.5 rounded"
                                title="Delete Comment"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {c.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-3">
                  {activity.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No activity recorded yet.
                    </p>
                  ) : (
                    activity.map((act) => (
                      <div
                        key={act.id}
                        className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-800/20 p-3 text-xs"
                      >
                        <Clock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">
                              {act.actor
                                ? `${act.actor.firstName} ${act.actor.lastName}`
                                : 'User'}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(act.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-300">
                            {act.action === 'TASK_CREATED' && 'Created this task.'}
                            {act.action === 'STATUS_CHANGED' && (
                              <span>
                                Changed status from <strong className="text-slate-200">{act.fromValue}</strong> to{' '}
                                <strong className="text-blue-400">{act.toValue}</strong>.
                              </span>
                            )}
                            {act.action === 'PRIORITY_CHANGED' && (
                              <span>
                                Changed priority from <strong className="text-slate-200">{act.fromValue}</strong> to{' '}
                                <strong className="text-amber-400">{act.toValue}</strong>.
                              </span>
                            )}
                            {act.action === 'ASSIGNEE_CHANGED' && 'Reassigned task.'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
