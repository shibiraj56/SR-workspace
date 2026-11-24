export interface DepartmentHeadSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  workEmail?: string | null;
}

export interface Department {
  id: string;
  tenantId: string;
  organisationId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  departmentHeadId?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: number;
  updatedAt: number;
  departmentHead?: DepartmentHeadSummary | null;
  employeeCount?: number;
}

export interface DepartmentListResponse {
  items: Department[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateDepartmentPayload {
  name: string;
  code: string;
  description?: string;
  departmentHeadId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateDepartmentPayload {
  name?: string;
  code?: string;
  description?: string | null;
  departmentHeadId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}
