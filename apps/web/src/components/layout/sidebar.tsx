import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Network,
  FolderKanban,
  CheckSquare,
  MessageSquare,
  Settings,
  Building2,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isPlaceholder?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Employees', href: '/employees', icon: Users },
  { title: 'Departments', href: '/departments', icon: Network },
  { title: 'Projects', href: '/projects', icon: FolderKanban },
  { title: 'Tasks', href: '/tasks', icon: CheckSquare },
  { title: 'Communication', href: '/communication', icon: MessageSquare },
  { title: 'Settings', href: '/settings', icon: Settings, isPlaceholder: true },
];

export function Sidebar() {
  const { activeTenant } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 px-6 border-b border-neutral-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shrink-0 shadow-sm">
          <Building2 className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm text-neutral-900 tracking-tight leading-none">
            SR WORKSPACE
          </span>
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest leading-normal mt-0.5">
            SR CODE LABS
          </span>
        </div>
      </div>

      {/* Tenant Context Indicator */}
      <div className="px-4 py-3 bg-neutral-50/60 border-b border-neutral-100">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
          Active Workspace
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="truncate">{activeTenant?.name || 'Primary Workspace'}</span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Main Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{item.title}</span>
              {item.isPlaceholder && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400 uppercase">
                  Soon
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-neutral-100 text-[11px] text-neutral-400 flex items-center justify-between">
        <span>v1.0.0 Cloudflare Edge</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Edge Connected" />
      </div>
    </aside>
  );
}
