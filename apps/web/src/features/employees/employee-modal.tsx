import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { Employee, CreateEmployeeInput, UpdateEmployeeInput, EmploymentType, EmploymentStatus } from '../../types/employee';
import type { Department } from '../../types/department';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateEmployeeInput | UpdateEmployeeInput) => Promise<void>;
  employee?: Employee | null;
  departments: Department[];
  managers: Employee[];
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  employee,
  departments,
  managers,
}) => {
  const isEditing = !!employee;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [managerEmployeeId, setManagerEmployeeId] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('FULL_TIME');
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>('ACTIVE');
  const [joiningDate, setJoiningDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setFirstName(employee.firstName);
      setLastName(employee.lastName);
      setEmployeeCode(employee.employeeCode);
      setWorkEmail(employee.workEmail || '');
      setPhone(employee.phone || '');
      setJobTitle(employee.jobTitle || '');
      setDepartmentId(employee.departmentId || '');
      setManagerEmployeeId(employee.managerEmployeeId || '');
      setEmploymentType(employee.employmentType);
      setEmploymentStatus(employee.employmentStatus);
      setJoiningDate(employee.joiningDate ? new Date(employee.joiningDate).toISOString().split('T')[0] : '');
    } else {
      setFirstName('');
      setLastName('');
      setEmployeeCode('');
      setWorkEmail('');
      setPhone('');
      setJobTitle('');
      setDepartmentId('');
      setManagerEmployeeId('');
      setEmploymentType('FULL_TIME');
      setEmploymentStatus('ACTIVE');
      setJoiningDate(new Date().toISOString().split('T')[0]);
    }
    setError(null);
  }, [employee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !employeeCode.trim() || !workEmail.trim()) {
      setError('First name, last name, employee code, and work email are required.');
      return;
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim())) {
      setError('Please enter a valid work email address.');
      return;
    }

    try {
      setSaving(true);
      if (isEditing) {
        await onSave({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          workEmail: workEmail.trim(),
          phone: phone.trim() ? phone.trim() : null,
          jobTitle: jobTitle.trim() ? jobTitle.trim() : null,
          departmentId: departmentId ? departmentId : null,
          managerEmployeeId: managerEmployeeId ? managerEmployeeId : null,
          employmentType,
          employmentStatus,
          joiningDate: joiningDate || null,
        } as UpdateEmployeeInput);
      } else {
        await onSave({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          employeeCode: employeeCode.trim().toUpperCase(),
          workEmail: workEmail.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          departmentId: departmentId || undefined,
          managerEmployeeId: managerEmployeeId || undefined,
          employmentType,
          joiningDate: joiningDate || undefined,
        } as CreateEmployeeInput);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  };

  // Ensure departments and managers are strictly arrays
  const safeDepartments = Array.isArray(departments) ? departments : [];
  const safeManagers = Array.isArray(managers) ? managers : [];

  // Filter out the current employee from the manager selection list to prevent self-reference
  const availableManagers = safeManagers.filter((m) => !employee || m.id !== employee.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Employee Record' : 'Add New Employee'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                First Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Last Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Employee Code <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP-001"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              {isEditing && (
                <p className="mt-1 text-xs text-muted-foreground">Employee code cannot be changed once created.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Work Email <span className="text-destructive">*</span>
              </label>
              <input
                type="email"
                required
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                placeholder="jane.doe@srcodelab.space"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Senior Software Engineer"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Department
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">None (Unassigned)</option>
                {safeDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Reporting Manager
              </label>
              <select
                value={managerEmployeeId}
                onChange={(e) => setManagerEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">None (Top-level / Self)</option>
                {availableManagers.map((mgr) => (
                  <option key={mgr.id} value={mgr.id}>
                    {mgr.firstName} {mgr.lastName} ({mgr.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Employment Type
              </label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
            {isEditing && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Status
                </label>
                <select
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ON_LEAVE">On Leave</option>
                  <option value="TERMINATED">Terminated</option>
                </select>
              </div>
            )}
            <div className={!isEditing ? 'md:col-span-2' : ''}>
              <label className="block text-xs font-medium text-foreground mb-1">
                Joining Date
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
