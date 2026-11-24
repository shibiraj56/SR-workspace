import React from 'react';
import { useLocation } from 'react-router-dom';
import { Construction, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ModuleConfig {
  title: string;
  description: string;
  milestone: string;
}

const MODULES_MAP: Record<string, ModuleConfig> = {
  '/employees': {
    title: 'Employees Directory',
    description: 'Manage workforce profiles, roles, and departmental assignments.',
    milestone: 'Milestone 4',
  },
  '/departments': {
    title: 'Departments & Hierarchy',
    description: 'Organizational structures, division management, and reporting lines.',
    milestone: 'Milestone 4',
  },
  '/projects': {
    title: 'Project Management',
    description: 'Enterprise project tracking, milestones, and deliverable workflows.',
    milestone: 'Milestone 5',
  },
  '/tasks': {
    title: 'Task Tracking',
    description: 'Task assignments, priority queues, and lifecycle states.',
    milestone: 'Milestone 5',
  },
  '/communication': {
    title: 'Communication Hub',
    description: 'Internal messaging channels, announcements, and team collaboration.',
    milestone: 'Milestone 6',
  },
  '/settings': {
    title: 'Workspace Settings',
    description: 'Tenant administration, security policies, and team configuration.',
    milestone: 'Milestone 7',
  },
};

export function PlaceholderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const moduleConfig = MODULES_MAP[location.pathname] || {
    title: 'Module In Development',
    description: 'This business module is scheduled in accordance with the project roadmap.',
    milestone: 'Upcoming Milestone',
  };

  return (
    <div className="bg-white border border-neutral-200/80 rounded-2xl p-12 text-center shadow-xs max-w-2xl mx-auto my-12">
      <div className="w-12 h-12 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center mx-auto mb-4 border border-neutral-200">
        <Construction className="w-6 h-6 text-brand-600" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
        {moduleConfig.milestone}
      </span>
      <h1 className="text-xl font-bold text-neutral-900 mt-3">
        {moduleConfig.title}
      </h1>
      <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto leading-relaxed">
        {moduleConfig.description}
      </p>

      <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Button>
      </div>
    </div>
  );
}
