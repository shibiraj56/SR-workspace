import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from '@/features/auth/route-guards';
import { LoginPage } from '@/features/auth/login-page';
import { AppLayout } from '@/components/layout/app-layout';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { EmployeesPage } from '@/features/employees/employees-page';
import { DepartmentsPage } from '@/features/departments/departments-page';
import { ProjectsPage } from '@/features/projects/projects-page';
import { ProjectDetailPage } from '@/features/projects/project-detail-page';
import { ProjectBoardPage } from '@/features/projects/project-board-page';
import { TasksPage } from '@/features/tasks/tasks-page';
import { CommunicationPage } from '@/features/communication/communication-page';
import { PlaceholderPage } from '@/features/placeholders/placeholder-page';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'employees', element: <EmployeesPage /> },
          { path: 'departments', element: <DepartmentsPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:id', element: <ProjectDetailPage /> },
          { path: 'projects/:id/board', element: <ProjectBoardPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'communication', element: <CommunicationPage /> },
          { path: 'settings', element: <PlaceholderPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
