import { z } from 'zod';

// ==========================================
// 1. LIFECYCLE & ONBOARDING SCHEMAS
// ==========================================

export const createOnboardingTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  category: z.enum(['DOCUMENTATION', 'IT_SETUP', 'TRAINING', 'ORIENTATION', 'ADMIN']).default('DOCUMENTATION'),
  assignedToEmployeeId: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD').optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateOnboardingTaskSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.enum(['DOCUMENTATION', 'IT_SETUP', 'TRAINING', 'ORIENTATION', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  assignedToEmployeeId: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createResignationSchema = z.object({
  resignationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Resignation date must be YYYY-MM-DD'),
  proposedLastWorkingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Proposed last working date must be YYYY-MM-DD'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

export const updateResignationSchema = z.object({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'COMPLETED']).optional(),
  actualLastWorkingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  managerComments: z.string().optional().nullable(),
  exitInterviewNotes: z.string().optional().nullable(),
});

export const updateExitChecklistSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'WAIVED']),
  notes: z.string().optional().nullable(),
});

// ==========================================
// 2. DOCUMENT METADATA SCHEMAS
// ==========================================

export const createDocumentMetadataSchema = z.object({
  title: z.string().min(1, 'Document title is required'),
  documentType: z.enum(['NATIONAL_ID', 'PASSPORT', 'CERTIFICATE', 'CONTRACT', 'RESUME', 'OTHER']),
  documentNumber: z.string().optional().nullable(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateDocumentMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  documentType: z.enum(['NATIONAL_ID', 'PASSPORT', 'CERTIFICATE', 'CONTRACT', 'RESUME', 'OTHER']).optional(),
  documentNumber: z.string().optional().nullable(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  notes: z.string().optional().nullable(),
});

// ==========================================
// 3. ATTENDANCE & REGULARIZATION SCHEMAS
// ==========================================

export const punchInSchema = z.object({
  employeeId: z.string().optional(),
  note: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const punchOutSchema = z.object({
  employeeId: z.string().optional(),
  note: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listAttendanceQuerySchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

export const createRegularizationSchema = z.object({
  attendanceRecordId: z.string().optional().nullable(),
  employeeId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  requestedPunchIn: z.number().int().positive('Requested punch-in timestamp is required'),
  requestedPunchOut: z.number().int().positive('Requested punch-out timestamp is required'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

export const updateRegularizationSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNotes: z.string().optional().nullable(),
});

// ==========================================
// 4. LEAVE MANAGEMENT SCHEMAS
// ==========================================

export const createLeaveTypeSchema = z.object({
  code: z.string().min(2).max(20).transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  defaultDaysPerYear: z.number().min(0).default(0),
  isPaid: z.boolean().default(true),
  requiresProof: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateLeaveTypeSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  defaultDaysPerYear: z.number().min(0).optional(),
  isPaid: z.boolean().optional(),
  requiresProof: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createLeaveAllocationSchema = z.object({
  employeeId: z.string(),
  leaveTypeId: z.string(),
  year: z.number().int().min(2000).max(2100),
  allocatedDays: z.number().min(0),
  notes: z.string().optional().nullable(),
});

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().optional(),
  leaveTypeId: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalDays: z.number().positive(),
  isHalfDay: z.boolean().default(false),
  halfDayPeriod: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional().nullable(),
  reason: z.string().min(3),
});

export const listLeaveRequestsQuerySchema = z.object({
  employeeId: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  year: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

export const reviewLeaveRequestSchema = z.object({
  reviewNotes: z.string().optional().nullable(),
});

// ==========================================
// 5. SHIFT SCHEMAS
// ==========================================

export const createShiftSchema = z.object({
  code: z.string().min(2).max(20).transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM'),
  gracePeriodMinutes: z.number().int().min(0).default(15),
  halfDayThresholdMinutes: z.number().int().min(0).default(240),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateShiftSchema = z.object({
  name: z.string().min(2).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  gracePeriodMinutes: z.number().int().min(0).optional(),
  halfDayThresholdMinutes: z.number().int().min(0).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const assignShiftSchema = z.object({
  shiftId: z.string(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const updateEmployeeShiftSchema = z.object({
  shiftId: z.string().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// ==========================================
// 6. HOLIDAY SCHEMAS
// ==========================================

export const createHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  holidayType: z.enum(['MANDATORY', 'OPTIONAL']).default('MANDATORY'),
  description: z.string().optional().nullable(),
  applicableBranchId: z.string().optional().nullable(),
});

export const updateHolidaySchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  holidayType: z.enum(['MANDATORY', 'OPTIONAL']).optional(),
  description: z.string().optional().nullable(),
  applicableBranchId: z.string().optional().nullable(),
});

export const listHolidaysQuerySchema = z.object({
  year: z.coerce.number().optional(),
  branchId: z.string().optional(),
});

// ==========================================
// 7. PERFORMANCE MANAGEMENT SCHEMAS
// ==========================================

export const createPerformanceCycleSchema = z.object({
  code: z.string().min(2).max(30).transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional().nullable(),
});

export const updatePerformanceCycleSchema = z.object({
  name: z.string().min(2).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'EVALUATION', 'COMPLETED']).optional(),
  description: z.string().optional().nullable(),
});

export const createPerformanceReviewSchema = z.object({
  cycleId: z.string(),
  employeeId: z.string(),
  reviewerEmployeeId: z.string().optional().nullable(),
});

export const updatePerformanceReviewSchema = z.object({
  reviewerEmployeeId: z.string().optional().nullable(),
  selfRating: z.number().min(1).max(5).optional().nullable(),
  selfFeedback: z.string().optional().nullable(),
  managerRating: z.number().min(1).max(5).optional().nullable(),
  managerFeedback: z.string().optional().nullable(),
  goalsMet: z.string().optional().nullable(),
  finalScore: z.number().min(1).max(5).optional().nullable(),
});

export const submitPerformanceReviewSchema = z.object({
  type: z.enum(['SELF', 'MANAGER']),
  rating: z.number().min(1).max(5).optional(),
  feedback: z.string().optional(),
  goalsMet: z.string().optional(),
  finalScore: z.number().min(1).max(5).optional(),
});

// ==========================================
// 8. REPORT QUERY SCHEMAS
// ==========================================

export const reportQuerySchema = z.object({
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  year: z.coerce.number().optional(),
  month: z.coerce.number().min(1).max(12).optional(),
});
