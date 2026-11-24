import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api-client';
import type { DashboardStatistics } from '@/types/task';
import {
  User,
  Building,
  ShieldCheck,
  Server,
  Layers,
  ArrowRight,
  Clock,
  KeyRound,
  FolderKanban,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  History,
  TrendingUp,
  Kanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const { user, activeTenant, tenants, roles } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    api
      .get<DashboardStatistics>('/api/v1/tasks/dashboard/statistics')
      .then((data) => {
        setStats(data);
      })
      .catch((err) => {
        console.error('Failed to load dashboard stats:', err);
      })
      .finally(() => {
        setLoadingStats(false);
      });
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
              SR CODE LABS ENTERPRISE WORKSPACE
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Welcome, {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              You are currently authenticated in the{' '}
              <strong className="text-neutral-700 font-semibold">{activeTenant?.name || 'Primary'}</strong>{' '}
              workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-700 border border-neutral-200">
              {roles[0] || 'SUPER_ADMIN'}
            </span>
          </div>
        </div>
      </div>

      {/* Real Real-Time Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Projects */}
        <div
          onClick={() => navigate('/projects')}
          className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs cursor-pointer hover:border-brand-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Active Projects
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {loadingStats ? '—' : stats?.projects.active ?? 0}
            </span>
            <span className="text-xs text-neutral-400">
              of {loadingStats ? '—' : stats?.projects.total ?? 0} total
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-brand-600 font-medium">
            <span>Manage Projects</span>
            <ArrowRight className="w-3 h-3 ml-1" />
          </div>
        </div>

        {/* My Open Tasks */}
        <div
          onClick={() => navigate('/tasks')}
          className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs cursor-pointer hover:border-brand-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              My Open Tasks
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ListTodo className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {loadingStats ? '—' : stats?.tasks.myOpen ?? 0}
            </span>
            <span className="text-xs text-neutral-400">
              assigned to me
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-brand-600 font-medium">
            <span>View Tasks</span>
            <ArrowRight className="w-3 h-3 ml-1" />
          </div>
        </div>

        {/* Completed Tasks */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Completed Tasks
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {loadingStats ? '—' : stats?.tasks.completed ?? 0}
            </span>
            <span className="text-xs text-neutral-400">
              of {loadingStats ? '—' : stats?.tasks.total ?? 0} total
            </span>
          </div>
          <div className="mt-2 text-xs text-neutral-400">
            {stats && stats.tasks.total > 0
              ? `${Math.round((stats.tasks.completed / stats.tasks.total) * 100)}% delivery rate`
              : 'No tasks logged'}
          </div>
        </div>

        {/* Overdue Tasks */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Overdue Tasks
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {loadingStats ? '—' : stats?.tasks.overdue ?? 0}
            </span>
            <span className="text-xs text-neutral-400">past target deadline</span>
          </div>
          <div className="mt-2 text-xs text-neutral-400">
            {stats?.tasks.overdue === 0 ? 'All deadlines on track' : 'Requires immediate attention'}
          </div>
        </div>
      </div>

      {/* Recent Activity and Account Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Task Activity */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Recent Task Activity</h2>
                <p className="text-xs text-neutral-400">Real-time workspace modifications</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/tasks')}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              All Tasks
            </Button>
          </div>

          <div className="flex-1 space-y-3">
            {loadingStats ? (
              <p className="text-xs text-neutral-400 py-6 text-center">Loading activity feed...</p>
            ) : !stats?.recentActivity || stats.recentActivity.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">
                No recent task activity recorded in this workspace.
              </p>
            ) : (
              stats.recentActivity.slice(0, 5).map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-50/70 border border-neutral-200/50 text-xs"
                >
                  <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-800">
                        {act.actor ? `${act.actor.firstName} ${act.actor.lastName}` : 'System'}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-neutral-600">
                      {act.action === 'TASK_CREATED' && (
                        <span>
                          Created task <strong className="text-neutral-900">{act.task?.taskCode}</strong>
                        </span>
                      )}
                      {act.action === 'STATUS_CHANGED' && (
                        <span>
                          Moved <strong className="text-neutral-900">{act.task?.taskCode}</strong> to{' '}
                          <span className="font-semibold text-brand-700">{act.toValue}</span>
                        </span>
                      )}
                      {act.action === 'PRIORITY_CHANGED' && (
                        <span>
                          Set priority on <strong className="text-neutral-900">{act.task?.taskCode}</strong> to {act.toValue}
                        </span>
                      )}
                      {act.action === 'ASSIGNEE_CHANGED' && (
                        <span>Reassigned task {act.task?.taskCode}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Workspace Context Card */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100 mb-4">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
              <Building className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Workspace Context</h2>
              <p className="text-xs text-neutral-400">Multi-tenant boundary and subscription</p>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-1">
              <dt className="text-xs text-neutral-500 font-medium">Tenant Name</dt>
              <dd className="font-semibold text-neutral-800">
                {activeTenant?.name || 'Primary Workspace'}
              </dd>
            </div>
            <div className="flex justify-between items-center py-1">
              <dt className="text-xs text-neutral-500 font-medium">Slug</dt>
              <dd className="font-mono text-xs text-neutral-700 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">
                {activeTenant?.slug || 'default'}
              </dd>
            </div>
            <div className="flex justify-between items-center py-1">
              <dt className="text-xs text-neutral-500 font-medium">Subscription Plan</dt>
              <dd>
                <span className="inline-flex items-center text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                  {activeTenant?.plan || 'ENTERPRISE'}
                </span>
              </dd>
            </div>
            <div className="flex justify-between items-center py-1">
              <dt className="text-xs text-neutral-500 font-medium">Tenant ID</dt>
              <dd className="font-mono text-[11px] text-neutral-400">
                {activeTenant?.id}
              </dd>
            </div>
            <div className="flex justify-between items-center py-1">
              <dt className="text-xs text-neutral-500 font-medium">Accessible Workspaces</dt>
              <dd className="text-xs font-semibold text-neutral-700">
                {tenants.length} {tenants.length === 1 ? 'Workspace' : 'Workspaces'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Security & Edge Infrastructure Card */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100 mb-4">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Edge Architecture &amp; Security Foundation</h2>
            <p className="text-xs text-neutral-400">Verified backend capabilities</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 mb-1">
              <KeyRound className="w-4 h-4 text-brand-600" />
              <span>HttpOnly Cookies</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Zero browser localStorage token exposure; automated refresh rotation with breach reuse detection.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 mb-1">
              <Layers className="w-4 h-4 text-brand-600" />
              <span>Cloudflare D1</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Distributed SQLite engine with multi-tenant data scoping enforced at query boundary.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 mb-1">
              <Clock className="w-4 h-4 text-brand-600" />
              <span>Distributed Rate Limit</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Atomic sliding-window rate tracking across Cloudflare Worker V8 edge isolates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
