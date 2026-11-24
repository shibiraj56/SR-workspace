import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type {
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmploymentStatus,
  EmploymentType,
  EmployeeListResponse,
} from '../../types/employee';
import type { Department, DepartmentListResponse } from '../../types/department';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import { EmployeeModal } from './employee-modal';
import { EmployeeDetailModal } from './employee-detail-modal';

export const EmployeesPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  // Modals & Menu
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteConfirmEmployee, setDeleteConfirmEmployee] = useState<Employee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch departments for filter & modal dropdowns
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get<DepartmentListResponse>('/api/v1/departments?pageSize=100');
      const deptList = extractItems<Department>(res);
      setDepartments(deptList);
    } catch {
      // Non-critical: default to empty array
      setDepartments([]);
    }
  }, []);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (search.trim()) params.append('search', search.trim());
      if (selectedDept) params.append('departmentId', selectedDept);
      if (selectedStatus !== 'ALL') params.append('employmentStatus', selectedStatus);
      if (selectedType !== 'ALL') params.append('employmentType', selectedType);

      const res = await api.get<EmployeeListResponse>(`/api/v1/employees?${params.toString()}`);
      const empList = extractItems<Employee>(res);

      setEmployees(empList);
      setTotalPages(res?.totalPages || 1);
      setTotalCount(res?.total ?? empList.length);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred fetching employees.');
      }
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedDept, selectedStatus, selectedType]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handle Save (Create or Edit)
  const handleSave = async (data: CreateEmployeeInput | UpdateEmployeeInput) => {
    const isEdit = !!activeEmployee;
    if (isEdit) {
      await api.patch(`/api/v1/employees/${activeEmployee.id}`, data);
    } else {
      await api.post('/api/v1/employees', data);
    }
    await fetchEmployees();
  };

  // Handle Status Toggle
  const handleToggleStatus = async (emp: Employee, newStatus: EmploymentStatus) => {
    try {
      await api.patch(`/api/v1/employees/${emp.id}/status`, { status: newStatus });
      setActionMenuId(null);
      await fetchEmployees();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Error updating employee status');
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!deleteConfirmEmployee) return;

    try {
      setDeleteLoading(true);
      await api.delete(`/api/v1/employees/${deleteConfirmEmployee.id}`);
      setDeleteConfirmEmployee(null);
      await fetchEmployees();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to delete employee.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: EmploymentStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'INACTIVE':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
      case 'ON_LEAVE':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      case 'TERMINATED':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const safeDepartments = Array.isArray(departments) ? departments : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your organization's workforce, job titles, and reporting hierarchy.
          </p>
        </div>
        <button
          onClick={() => {
            setActiveEmployee(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, code, email..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-input bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="">All Departments</option>
            {safeDepartments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-input bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="TERMINATED">Terminated</option>
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-input bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="ALL">All Types</option>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERN">Intern</option>
          </select>

          <button
            onClick={() => fetchEmployees()}
            title="Refresh"
            className="p-2 rounded-lg border border-input bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading employees...</span>
          </div>
        ) : safeEmployees.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground">No employees found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {search || selectedDept || selectedStatus !== 'ALL' || selectedType !== 'ALL'
                ? 'Try adjusting your filters or search terms.'
                : 'Get started by registering your first employee in the directory.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Job Title</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Manager</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safeEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs shrink-0">
                          {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            <span>{emp.firstName} {emp.lastName}</span>
                            {emp.userId && (
                              <span title="Linked User Account" className="inline-flex text-emerald-600">
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {emp.employeeCode} • {emp.workEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-foreground text-xs font-medium">
                      {emp.jobTitle || <span className="text-muted-foreground">Not set</span>}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {emp.department ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {emp.department.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {emp.manager ? (
                        <span>{emp.manager.firstName} {emp.manager.lastName}</span>
                      ) : (
                        <span className="italic">Top-level</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-foreground">
                      {emp.employmentType.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(emp.employmentStatus)}`}>
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setActiveEmployee(emp);
                            setIsDetailOpen(true);
                          }}
                          title="View Details"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setActiveEmployee(emp);
                            setIsModalOpen(true);
                          }}
                          title="Edit Employee"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setActionMenuId(actionMenuId === emp.id ? null : emp.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {actionMenuId === emp.id && (
                            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-card border border-border shadow-lg py-1 z-20 text-left">
                              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
                                Change Status
                              </div>
                              {emp.employmentStatus !== 'ACTIVE' && (
                                <button
                                  onClick={() => handleToggleStatus(emp, 'ACTIVE')}
                                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent flex items-center gap-2"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Mark Active</span>
                                </button>
                              )}
                              {emp.employmentStatus !== 'INACTIVE' && (
                                <button
                                  onClick={() => handleToggleStatus(emp, 'INACTIVE')}
                                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent flex items-center gap-2"
                                >
                                  <span>Mark Inactive</span>
                                </button>
                              )}
                              {emp.employmentStatus !== 'ON_LEAVE' && (
                                <button
                                  onClick={() => handleToggleStatus(emp, 'ON_LEAVE')}
                                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent flex items-center gap-2"
                                >
                                  <span>Mark On Leave</span>
                                </button>
                              )}
                              {emp.employmentStatus !== 'TERMINATED' && (
                                <button
                                  onClick={() => handleToggleStatus(emp, 'TERMINATED')}
                                  className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center gap-2"
                                >
                                  <span>Mark Terminated</span>
                                </button>
                              )}
                              <div className="border-t border-border my-1" />
                              <button
                                onClick={() => {
                                  setActionMenuId(null);
                                  setDeleteConfirmEmployee(emp);
                                }}
                                className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete Record</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <div>
            Showing <span className="font-medium text-foreground">{safeEmployees.length}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span> employees
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-md border border-input bg-card text-foreground disabled:opacity-50 hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-medium text-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded-md border border-input bg-card text-foreground disabled:opacity-50 hover:bg-accent transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        employee={activeEmployee}
        departments={safeDepartments}
        managers={safeEmployees}
      />

      <EmployeeDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        employee={activeEmployee}
        onEdit={(emp) => {
          setActiveEmployee(emp);
          setIsModalOpen(true);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-6">
            <h3 className="text-base font-semibold text-foreground">Delete Employee Record</h3>
            <p className="text-xs text-muted-foreground mt-2">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                {deleteConfirmEmployee.firstName} {deleteConfirmEmployee.lastName} ({deleteConfirmEmployee.employeeCode})
              </span>
              ? Any department head or reporting manager assignments referencing this employee will be automatically cleared.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteConfirmEmployee(null)}
                disabled={deleteLoading}
                className="rounded-lg border border-input px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-lg bg-destructive px-3.5 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
