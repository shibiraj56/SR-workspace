export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export interface EmployeeDepartmentSummary {
  id: string;
  name: string;
  code: string;
  status?: string;
}

export interface EmployeeManagerSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  workEmail?: string | null;
}

export interface EmployeeUserSummary {
  id: string;
  email: string;
  status: string;
}

export interface Employee {
  id: string;
  tenantId: string;
  organisationId?: string | null;
  branchId?: string | null;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  managerEmployeeId?: string | null;
  userId?: string | null;
  employmentType: EmploymentType;
  joiningDate: number;
  employmentStatus: EmploymentStatus;
  profileImageUrl?: string | null;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
  department?: EmployeeDepartmentSummary | null;
  manager?: EmployeeManagerSummary | null;
  user?: EmployeeUserSummary | null;
}

export interface EmployeeListResponse {
  items: Employee[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateEmployeePayload {
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  jobTitle?: string;
  departmentId?: string | null;
  managerEmployeeId?: string | null;
  userId?: string | null;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  joiningDate?: string | Date;
  notes?: string;
}

export interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {}

export type CreateEmployeeInput = CreateEmployeePayload;
export type UpdateEmployeeInput = UpdateEmployeePayload;
