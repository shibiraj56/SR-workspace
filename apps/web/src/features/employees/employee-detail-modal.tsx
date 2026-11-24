import React from 'react';
import { X, Mail, Phone, Building2, UserCheck, Calendar, ShieldCheck, UserX } from 'lucide-react';
import type { Employee } from '../../types/employee';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onEdit: (employee: Employee) => void;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  isOpen,
  onClose,
  employee,
  onEdit,
}) => {
  if (!isOpen || !employee) return null;

  const getStatusBadge = (status: string) => {
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

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'FULL_TIME':
        return 'Full Time';
      case 'PART_TIME':
        return 'Part Time';
      case 'CONTRACT':
        return 'Contract';
      case 'INTERN':
        return 'Intern';
      default:
        return type;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-base">
              {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {employee.firstName} {employee.lastName}
              </h2>
              <p className="text-xs font-mono text-muted-foreground">{employee.employeeCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Status & Type Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(employee.employmentStatus)}`}>
              {employee.employmentStatus}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border">
              {getTypeBadge(employee.employmentType)}
            </span>
            {employee.jobTitle && (
              <span className="text-xs text-muted-foreground ml-auto font-medium">
                {employee.jobTitle}
              </span>
            )}
          </div>

          {/* Contact Information */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Contact & Organization
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${employee.workEmail}`} className="truncate hover:underline text-primary">
                  {employee.workEmail}
                </a>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{employee.phone || 'No phone set'}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {employee.department ? `${employee.department.name} (${employee.department.code})` : 'No Department'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : 'No Manager (Top Level)'}
                </span>
              </div>
            </div>
          </div>

          {/* User Account Link Status */}
          <div className="rounded-lg border border-border p-4 bg-muted/10">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              System Access Account
            </h3>
            {employee.userId ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Linked to active User Login Account ({employee.user?.email || employee.userId})</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserX className="h-4 w-4 shrink-0" />
                <span>No user login account linked. (Independent employee record)</span>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground border-t border-border pt-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Joined: {employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : 'Not recorded'}</span>
            </div>
            <div className="text-right">
              <span>Added: {new Date(employee.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3 bg-muted/20">
          <button
            onClick={() => {
              onClose();
              onEdit(employee);
            }}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Edit Employee
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-input px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
