export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProjectRole = 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  workEmail?: string | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: ProjectRole;
  createdAt: number | string;
  employee: EmployeeSummary;
}

export interface ProjectTaskStats {
  total: number;
  completed: number;
  progressPercentage: number;
  breakdown: Record<string, number>;
}

export interface Project {
  id: string;
  tenantId: string;
  projectCode: string;
  name: string;
  description?: string | null;
  ownerEmployeeId?: string | null;
  departmentId?: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate?: number | string | null;
  dueDate?: number | string | null;
  completedAt?: number | string | null;
  createdAt: number | string;
  updatedAt: number | string;
  owner?: EmployeeSummary | null;
  department?: DepartmentSummary | null;
  members?: ProjectMember[];
  taskStats?: ProjectTaskStats;
  taskCount?: number;
  completedTaskCount?: number;
  progressPercentage?: number;
}

export interface ProjectListResponse {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateProjectPayload {
  projectCode: string;
  name: string;
  description?: string | null;
  ownerEmployeeId?: string | null;
  departmentId?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  ownerEmployeeId?: string | null;
  departmentId?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: string | null;
  dueDate?: string | null;
}
