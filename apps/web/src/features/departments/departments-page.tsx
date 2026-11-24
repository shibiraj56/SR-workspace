import React, { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import type { Department, DepartmentListResponse } from '@/types/department';
import { DepartmentModal } from './department-modal';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Users,
  Edit2,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  // Delete confirmation dialog state
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchDepartments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await api.get<DepartmentListResponse>(`/api/v1/departments?${params.toString()}`);
      setDepartments(extractItems<Department>(res));
      setTotal(res?.total ?? 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load departments.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const handleDelete = async () => {
    if (!deletingDepartment) return;
    setDeleteLoading(true);
    setErrorMessage(null);

    try {
      await api.delete(`/api/v1/departments/${deletingDepartment.id}`);
      setSuccessMessage(`Department '${deletingDepartment.name}' was successfully deleted.`);
      setDeletingDepartment(null);
      fetchDepartments();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to delete department.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleStatus = async (dept: Department) => {
    const newStatus = dept.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/api/v1/departments/${dept.id}/status`, { status: newStatus });
      fetchDepartments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update department status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Departments
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Organize your enterprise workspace structure and departmental reporting units.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setEditingDepartment(null);
            setIsModalOpen(true);
          }}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Department</span>
        </Button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or code..."
            className="w-full bg-neutral-50/70 border border-neutral-200 rounded-lg pl-9 pr-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">
            Status:
          </span>
          <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg text-xs font-medium text-neutral-600">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  statusFilter === s
                    ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                    : 'hover:text-neutral-900'
                }`}
              >
                {s === 'ALL' ? 'All' : s === 'ACTIVE' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
            <span className="text-sm font-medium text-neutral-600">Loading departments...</span>
          </div>
        ) : departments.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-neutral-800">No departments found</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or status filter.'
                : 'Get started by creating the first department in this workspace.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/70 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-6">Department</th>
                  <th className="py-3 px-6">Code</th>
                  <th className="py-3 px-6">Department Head</th>
                  <th className="py-3 px-6 text-center">Assigned Employees</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-neutral-900">{dept.name}</div>
                      {dept.description && (
                        <div className="text-xs text-neutral-500 truncate max-w-xs mt-0.5">
                          {dept.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="inline-block px-2 py-0.5 rounded font-mono text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                        {dept.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      {dept.departmentHead ? (
                        <div>
                          <div className="font-medium text-neutral-800">
                            {dept.departmentHead.firstName} {dept.departmentHead.lastName}
                          </div>
                          <div className="text-xs text-neutral-400 font-mono">
                            {dept.departmentHead.employeeCode}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">None Assigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-semibold border border-neutral-200">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        {dept.employeeCount ?? 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          dept.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                        }`}
                      >
                        {dept.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingDepartment(dept);
                            setIsModalOpen(true);
                          }}
                          title="Edit Department"
                          className="p-1.5 text-neutral-600 hover:text-neutral-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingDepartment(dept)}
                          title="Delete Department"
                          className="p-1.5 text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <div>
              Showing <span className="font-semibold text-neutral-700">{departments.length}</span> of{' '}
              <span className="font-semibold text-neutral-700">{total}</span> departments
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="px-2 font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <DepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchDepartments();
          setSuccessMessage(
            editingDepartment ? 'Department updated successfully.' : 'Department created successfully.'
          );
          setTimeout(() => setSuccessMessage(null), 4000);
        }}
        departmentToEdit={editingDepartment}
      />

      {/* Delete Confirmation Dialog */}
      {deletingDepartment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-neutral-900">
              Delete Department '{deletingDepartment.name}'?
            </h3>
            <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
              This action cannot be undone. If any employees are assigned to this department, deletion will be blocked to preserve workforce data integrity.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingDepartment(null)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                isLoading={deleteLoading}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
