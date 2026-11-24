import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Project, ProjectListResponse, ProjectStatus, ProjectPriority } from '@/types/project';
import { ProjectModal } from './project-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Kanban,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Delete dialog state
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);

      const res = await api.get<ProjectListResponse>(`/api/v1/projects?${params.toString()}`);
      setProjects(extractItems<Project>(res));
      setTotal(res?.total ?? 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load projects.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = async () => {
    if (!deletingProject) return;
    setDeleteLoading(true);
    setErrorMessage(null);

    try {
      await api.delete(`/api/v1/projects/${deletingProject.id}`);
      setSuccessMessage(`Project '${deletingProject.name}' was successfully deleted.`);
      setDeletingProject(null);
      fetchProjects();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to delete project.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'PLANNING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Planning</span>;
      case 'ACTIVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>;
      case 'ON_HOLD':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">On Hold</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Completed</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: ProjectPriority) => {
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
            <FolderKanban className="h-6 w-6 text-blue-400" />
            Project Management
          </h1>
          <p className="text-sm text-slate-400">
            Manage multi-team projects, milestones, task breakdowns, and sprint allocations.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingProject(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Notifications */}
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
            placeholder="Search projects by name or code..."
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
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
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

      {/* Projects Table / Grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3.5 px-4">Project</th>
                <th className="py-3.5 px-4">Owner & Dept</th>
                <th className="py-3.5 px-4">Priority</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Progress</th>
                <th className="py-3.5 px-4">Timeline</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500" />
                    <p className="mt-2 text-xs">Loading projects...</p>
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <FolderKanban className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                    <p className="text-sm font-medium">No projects found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {search || statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                        ? 'Try adjusting your search filters.'
                        : 'Get started by creating your first project.'}
                    </p>
                  </td>
                </tr>
              ) : (
                projects.map((proj) => {
                  const progress = proj.progressPercentage ?? 0;
                  return (
                    <tr key={proj.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400">
                            {proj.projectCode}
                          </span>
                          <span
                            onClick={() => navigate(`/projects/${proj.id}`)}
                            className="cursor-pointer hover:text-blue-400 hover:underline"
                          >
                            {proj.name}
                          </span>
                        </div>
                        {proj.description && (
                          <p className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                            {proj.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {proj.owner ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-300">
                            <User className="h-3.5 w-3.5 text-slate-500" />
                            <span>
                              {proj.owner.firstName} {proj.owner.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Unassigned</span>
                        )}
                        {proj.department && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-500" />
                            <span>{proj.department.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{getPriorityBadge(proj.priority)}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(proj.status)}</td>
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-400">
                            {proj.completedTaskCount ?? 0}/{proj.taskCount ?? 0} tasks
                          </span>
                          <span className="font-medium text-slate-300">{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              progress === 100
                                ? 'bg-emerald-500'
                                : progress > 50
                                ? 'bg-blue-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {proj.dueDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                            <span>Due {new Date(proj.dueDate).toLocaleDateString()}</span>
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
                            onClick={() => navigate(`/projects/${proj.id}/board`)}
                            title="Open Kanban Board"
                            className="h-8 px-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                          >
                            <Kanban className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/projects/${proj.id}`)}
                            title="View Project Details"
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingProject(proj);
                              setIsModalOpen(true);
                            }}
                            title="Edit Project"
                            className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProject(proj)}
                            title="Delete Project"
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
              Showing <span className="font-medium text-white">{projects.length}</span> of{' '}
              <span className="font-medium text-white">{total}</span> projects
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
      {deletingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              Are you sure you want to delete project{' '}
              <strong className="text-white">
                {deletingProject.name} ({deletingProject.projectCode})
              </strong>
              ?
            </p>
            <p className="mt-2 text-xs text-slate-400">
              This action cannot be undone. Note: Projects containing active or uncompleted tasks
              cannot be deleted.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeletingProject(null)}
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
                {deleteLoading ? 'Deleting...' : 'Delete Project'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Project Modal */}
      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProject(null);
        }}
        onSuccess={() => {
          setSuccessMessage(
            editingProject
              ? 'Project updated successfully.'
              : 'Project created successfully.'
          );
          fetchProjects();
          setTimeout(() => setSuccessMessage(null), 4000);
        }}
        projectToEdit={editingProject}
      />
    </div>
  );
}
