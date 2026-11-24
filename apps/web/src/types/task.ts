import type { EmployeeSummary } from './project';

export type TaskStatus =
  | 'BACKLOG'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskProjectSummary {
  id: string;
  name: string;
  projectCode: string;
}

export interface TaskParentSummary {
  id: string;
  taskCode: string;
  title: string;
}

export interface TaskUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorUserId: string;
  content: string;
  createdAt: number | string;
  updatedAt: number | string;
  author?: TaskUserSummary | null;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  userId: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  createdAt: number | string;
  actor?: TaskUserSummary | null;
  task?: TaskParentSummary | null;
}

export interface Task {
  id: string;
  tenantId: string;
  projectId: string;
  taskCode: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeEmployeeId?: string | null;
  reporterEmployeeId?: string | null;
  parentTaskId?: string | null;
  startDate?: number | string | null;
  dueDate?: number | string | null;
  completedAt?: number | string | null;
  position: number;
  createdAt: number | string;
  updatedAt: number | string;
  project?: TaskProjectSummary | null;
  assignee?: EmployeeSummary | null;
  reporter?: EmployeeSummary | null;
  parentTask?: TaskParentSummary | null;
  subtasks?: Task[];
  commentsCount?: number;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateTaskPayload {
  projectId: string;
  taskCode: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeEmployeeId?: string | null;
  reporterEmployeeId?: string | null;
  parentTaskId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  position?: number;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeEmployeeId?: string | null;
  reporterEmployeeId?: string | null;
  parentTaskId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  position?: number;
}

export interface DashboardStatistics {
  projects: {
    total: number;
    active: number;
    completed: number;
    onHold: number;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    myOpen: number;
  };
  recentActivity: TaskActivity[];
}
