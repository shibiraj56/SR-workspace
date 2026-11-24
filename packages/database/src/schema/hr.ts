import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { employees } from './employees';
import { users } from './users';
import { branches } from './organisations';

// ==========================================
// 1. SHIFTS & EMPLOYEE SHIFT ASSIGNMENTS
// ==========================================

export const shifts = sqliteTable(
  'shifts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    startTime: text('start_time').notNull(), // HH:MM
    endTime: text('end_time').notNull(),     // HH:MM
    gracePeriodMinutes: integer('grace_period_minutes').default(15).notNull(),
    halfDayThresholdMinutes: integer('half_day_threshold_minutes').default(240).notNull(),
    description: text('description'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('shifts_tenant_idx').on(table.tenantId),
    tenantCodeUnique: uniqueIndex('shifts_tenant_code_uidx').on(table.tenantId, table.code),
  })
);

export const employeeShifts = sqliteTable(
  'employee_shifts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD
    effectiveTo: text('effective_to'),               // YYYY-MM-DD (nullable for ongoing)
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantEmpIdx: index('emp_shifts_tenant_emp_idx').on(table.tenantId, table.employeeId),
    shiftIdx: index('emp_shifts_shift_idx').on(table.shiftId),
    datesIdx: index('emp_shifts_dates_idx').on(table.tenantId, table.effectiveFrom, table.effectiveTo),
  })
);

// ==========================================
// 2. HOLIDAY CALENDAR
// ==========================================

export const HOLIDAY_TYPE = ['MANDATORY', 'OPTIONAL'] as const;
export type HolidayType = (typeof HOLIDAY_TYPE)[number];

export const holidays = sqliteTable(
  'holidays',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    holidayType: text('holiday_type', { enum: HOLIDAY_TYPE }).default('MANDATORY').notNull(),
    description: text('description'),
    applicableBranchId: text('applicable_branch_id').references(() => branches.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('holidays_tenant_idx').on(table.tenantId),
    branchIdx: index('holidays_branch_idx').on(table.applicableBranchId),
    globalDateUnique: uniqueIndex('holidays_global_uidx')
      .on(table.tenantId, table.date)
      .where(sql`${table.applicableBranchId} IS NULL`),
    branchDateUnique: uniqueIndex('holidays_branch_uidx')
      .on(table.tenantId, table.date, table.applicableBranchId)
      .where(sql`${table.applicableBranchId} IS NOT NULL`),
  })
);

// ==========================================
// 3. ATTENDANCE & ATTENDANCE REGULARIZATION
// ==========================================

export const ATTENDANCE_STATUS = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const attendanceRecords = sqliteTable(
  'attendance_records',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // YYYY-MM-DD local branch/tenant date
    punchInTime: integer('punch_in_time', { mode: 'timestamp_ms' }),   // UTC timestamp
    punchOutTime: integer('punch_out_time', { mode: 'timestamp_ms' }), // UTC timestamp
    totalWorkMinutes: integer('total_work_minutes').default(0).notNull(),
    totalBreakMinutes: integer('total_break_minutes').default(0).notNull(),
    status: text('status', { enum: ATTENDANCE_STATUS }).notNull().default('PRESENT'),
    punchInIp: text('punch_in_ip'),
    punchOutIp: text('punch_out_ip'),
    punchInNote: text('punch_in_note'),
    punchOutNote: text('punch_out_note'),
    remarks: text('remarks'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantEmpDateUnique: uniqueIndex('attendance_tenant_emp_date_uidx').on(
      table.tenantId,
      table.employeeId,
      table.date
    ),
    tenantDateIdx: index('attendance_tenant_date_idx').on(table.tenantId, table.date),
    tenantEmpIdx: index('attendance_tenant_emp_idx').on(table.tenantId, table.employeeId),
    statusIdx: index('attendance_status_idx').on(table.tenantId, table.status),
  })
);

export const REGULARIZATION_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type RegularizationStatus = (typeof REGULARIZATION_STATUS)[number];

export const attendanceRegularizations = sqliteTable(
  'attendance_regularizations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    attendanceRecordId: text('attendance_record_id').references(() => attendanceRecords.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    requestedPunchIn: integer('requested_punch_in', { mode: 'timestamp_ms' }).notNull(),
    requestedPunchOut: integer('requested_punch_out', { mode: 'timestamp_ms' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: REGULARIZATION_STATUS }).default('PENDING').notNull(),
    reviewedByEmployeeId: text('reviewed_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    reviewNotes: text('review_notes'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantEmpIdx: index('regularization_tenant_emp_idx').on(table.tenantId, table.employeeId),
    recordIdx: index('regularization_record_idx').on(table.attendanceRecordId),
    statusIdx: index('regularization_status_idx').on(table.tenantId, table.status),
  })
);

// ==========================================
// 4. LEAVE TYPES, ALLOCATIONS & APPLICATIONS
// ==========================================

export const leaveTypes = sqliteTable(
  'leave_types',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // CASUAL, SICK, ANNUAL, MATERNITY, UNPAID, etc.
    name: text('name').notNull(),
    description: text('description'),
    defaultDaysPerYear: real('default_days_per_year').default(0).notNull(),
    isPaid: integer('is_paid', { mode: 'boolean' }).default(true).notNull(),
    requiresProof: integer('requires_proof', { mode: 'boolean' }).default(false).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantIdx: index('leave_types_tenant_idx').on(table.tenantId),
    tenantCodeUnique: uniqueIndex('leave_types_tenant_code_uidx').on(table.tenantId, table.code),
  })
);

export const leaveAllocations = sqliteTable(
  'leave_allocations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    leaveTypeId: text('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    allocatedDays: real('allocated_days').default(0).notNull(),
    usedDays: real('used_days').default(0).notNull(),
    pendingDays: real('pending_days').default(0).notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantEmpTypeYearUnique: uniqueIndex('leave_alloc_tenant_emp_type_year_uidx').on(
      table.tenantId,
      table.employeeId,
      table.leaveTypeId,
      table.year
    ),
    tenantEmpIdx: index('leave_alloc_tenant_emp_idx').on(table.tenantId, table.employeeId),
  })
);

export const LEAVE_REQUEST_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUS)[number];

export const HALF_DAY_PERIOD = ['FIRST_HALF', 'SECOND_HALF'] as const;
export type HalfDayPeriod = (typeof HALF_DAY_PERIOD)[number];

export const leaveRequests = sqliteTable(
  'leave_requests',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    leaveTypeId: text('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'restrict' }),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(),     // YYYY-MM-DD
    totalDays: real('total_days').notNull(),
    isHalfDay: integer('is_half_day', { mode: 'boolean' }).default(false).notNull(),
    halfDayPeriod: text('half_day_period', { enum: HALF_DAY_PERIOD }),
    reason: text('reason').notNull(),
    status: text('status', { enum: LEAVE_REQUEST_STATUS }).default('PENDING').notNull(),
    reviewedByEmployeeId: text('reviewed_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    reviewNotes: text('review_notes'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantEmpIdx: index('leave_requests_tenant_emp_idx').on(table.tenantId, table.employeeId),
    statusIdx: index('leave_requests_tenant_status_idx').on(table.tenantId, table.status),
    datesIdx: index('leave_requests_dates_idx').on(table.tenantId, table.startDate, table.endDate),
  })
);

// ==========================================
// 5. PERFORMANCE REVIEWS & CYCLES
// ==========================================

export const PERFORMANCE_CYCLE_STATUS = ['DRAFT', 'ACTIVE', 'EVALUATION', 'COMPLETED'] as const;
export type PerformanceCycleStatus = (typeof PERFORMANCE_CYCLE_STATUS)[number];

export const performanceCycles = sqliteTable(
  'performance_cycles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(),     // YYYY-MM-DD
    status: text('status', { enum: PERFORMANCE_CYCLE_STATUS }).default('DRAFT').notNull(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tenantCodeUnique: uniqueIndex('perf_cycles_tenant_code_uidx').on(table.tenantId, table.code),
    statusIdx: index('perf_cycles_tenant_status_idx').on(table.tenantId, table.status),
  })
);

export const PERFORMANCE_REVIEW_STATUS = [
  'PENDING_SELF_REVIEW',
  'PENDING_MANAGER_REVIEW',
  'COMPLETED',
] as const;
export type PerformanceReviewStatus = (typeof PERFORMANCE_REVIEW_STATUS)[number];

export const performanceReviews = sqliteTable(
  'performance_reviews',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => performanceCycles.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    reviewerEmployeeId: text('reviewer_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    selfRating: real('self_rating'),
    selfFeedback: text('self_feedback'),
    managerRating: real('manager_rating'),
    managerFeedback: text('manager_feedback'),
    goalsMet: text('goals_met'),
    finalScore: real('final_score'),
    status: text('status', { enum: PERFORMANCE_REVIEW_STATUS }).default('PENDING_SELF_REVIEW').notNull(),
    selfSubmittedAt: integer('self_submitted_at', { mode: 'timestamp_ms' }),
    managerSubmittedAt: integer('manager_submitted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    cycleEmpUnique: uniqueIndex('perf_reviews_cycle_emp_uidx').on(
      table.tenantId,
      table.cycleId,
      table.employeeId
    ),
    tenantEmpIdx: index('perf_reviews_tenant_emp_idx').on(table.tenantId, table.employeeId),
    reviewerIdx: index('perf_reviews_reviewer_idx').on(table.tenantId, table.reviewerEmployeeId),
  })
);

// ==========================================
// 6. EMPLOYEE LIFECYCLE & ONBOARDING
// ==========================================

export const ONBOARDING_CATEGORY = [
  'DOCUMENTATION',
  'IT_SETUP',
  'TRAINING',
  'ORIENTATION',
  'ADMIN',
] as const;
export type OnboardingCategory = (typeof ONBOARDING_CATEGORY)[number];

export const ONBOARDING_TASK_STATUS = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export type OnboardingTaskStatus = (typeof ONBOARDING_TASK_STATUS)[number];

export const hrOnboardingTasks = sqliteTable(
  'hr_onboarding_tasks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category', { enum: ONBOARDING_CATEGORY }).default('DOCUMENTATION').notNull(),
    status: text('status', { enum: ONBOARDING_TASK_STATUS }).default('PENDING').notNull(),
    assignedToEmployeeId: text('assigned_to_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    dueDate: text('due_date'), // YYYY-MM-DD
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    empIdx: index('onboarding_tasks_emp_idx').on(table.tenantId, table.employeeId),
    statusIdx: index('onboarding_tasks_status_idx').on(table.tenantId, table.status),
  })
);

export const LIFECYCLE_EVENT_TYPE = [
  'ONBOARDING',
  'PROBATION_CONFIRMATION',
  'PROMOTION',
  'TRANSFER',
  'STATUS_CHANGE',
  'RESIGNATION',
  'TERMINATION',
] as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPE)[number];

export const hrLifecycleEvents = sqliteTable(
  'hr_lifecycle_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    eventType: text('event_type', { enum: LIFECYCLE_EVENT_TYPE }).notNull(),
    previousState: text('previous_state'),
    newState: text('new_state').notNull(),
    effectiveDate: text('effective_date').notNull(), // YYYY-MM-DD
    remarks: text('remarks'),
    recordedByUserId: text('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    empIdx: index('lifecycle_events_emp_idx').on(table.tenantId, table.employeeId),
    typeIdx: index('lifecycle_events_type_idx').on(table.tenantId, table.eventType),
  })
);

export const RESIGNATION_STATUS = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'COMPLETED',
] as const;
export type ResignationStatus = (typeof RESIGNATION_STATUS)[number];

export const hrResignations = sqliteTable(
  'hr_resignations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    resignationDate: text('resignation_date').notNull(), // YYYY-MM-DD
    proposedLastWorkingDate: text('proposed_last_working_date').notNull(), // YYYY-MM-DD
    actualLastWorkingDate: text('actual_last_working_date'),               // YYYY-MM-DD
    reason: text('reason').notNull(),
    status: text('status', { enum: RESIGNATION_STATUS }).default('SUBMITTED').notNull(),
    managerComments: text('manager_comments'),
    exitInterviewNotes: text('exit_interview_notes'),
    reviewedByEmployeeId: text('reviewed_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    empIdx: index('resignations_emp_idx').on(table.tenantId, table.employeeId),
    statusIdx: index('resignations_status_idx').on(table.tenantId, table.status),
  })
);

export const EXIT_DEPARTMENT = ['IT', 'FINANCE', 'HR', 'ADMIN', 'OPERATIONS'] as const;
export type ExitDepartment = (typeof EXIT_DEPARTMENT)[number];

export const EXIT_ITEM_STATUS = ['PENDING', 'COMPLETED', 'WAIVED'] as const;
export type ExitItemStatus = (typeof EXIT_ITEM_STATUS)[number];

export const hrExitChecklists = sqliteTable(
  'hr_exit_checklists',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resignationId: text('resignation_id')
      .notNull()
      .references(() => hrResignations.id, { onDelete: 'cascade' }),
    department: text('department', { enum: EXIT_DEPARTMENT }).notNull(),
    item: text('item').notNull(),
    status: text('status', { enum: EXIT_ITEM_STATUS }).default('PENDING').notNull(),
    clearedByEmployeeId: text('cleared_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    clearedAt: integer('cleared_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    resigIdx: index('exit_checklists_resig_idx').on(table.tenantId, table.resignationId),
    statusIdx: index('exit_checklists_status_idx').on(table.tenantId, table.status),
  })
);

// ==========================================
// 7. EMPLOYEE DOCUMENT METADATA
// ==========================================

export const DOCUMENT_TYPE = [
  'NATIONAL_ID',
  'PASSPORT',
  'CERTIFICATE',
  'CONTRACT',
  'RESUME',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[number];

export const DOCUMENT_VERIFICATION_STATUS = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUS)[number];

export const hrDocumentMetadata = sqliteTable(
  'hr_document_metadata',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    documentType: text('document_type', { enum: DOCUMENT_TYPE }).notNull(),
    documentNumber: text('document_number'),
    issuedDate: text('issued_date'), // YYYY-MM-DD
    expiryDate: text('expiry_date'), // YYYY-MM-DD
    verificationStatus: text('verification_status', { enum: DOCUMENT_VERIFICATION_STATUS })
      .default('PENDING')
      .notNull(),
    verifiedByEmployeeId: text('verified_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    empIdx: index('doc_meta_emp_idx').on(table.tenantId, table.employeeId),
    typeIdx: index('doc_meta_type_idx').on(table.tenantId, table.documentType),
    statusIdx: index('doc_meta_status_idx').on(table.tenantId, table.verificationStatus),
  })
);
