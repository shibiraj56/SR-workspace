import { relations } from 'drizzle-orm';
import { tenants, tenantSettings } from './tenants';
import { organisations, branches } from './organisations';
import { users, userTenants, refreshTokens } from './users';
import { roles, permissions, rolePermissions, userRoles } from './roles';
import { departments } from './departments';
import { employees } from './employees';
import { invitations } from './invitations';
import { projects, projectMembers } from './projects';
import { tasks, taskComments, taskActivity } from './tasks';
import { conversations, conversationMembers, messages, messageReactions, attachments } from './conversations';
import { notifications } from './notifications';
import { auditLogs } from './audit';
import {
  shifts,
  employeeShifts,
  holidays,
  attendanceRecords,
  attendanceRegularizations,
  leaveTypes,
  leaveAllocations,
  leaveRequests,
  performanceCycles,
  performanceReviews,
  hrOnboardingTasks,
  hrLifecycleEvents,
  hrResignations,
  hrExitChecklists,
  hrDocumentMetadata,
} from './hr';

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  settings: one(tenantSettings, {
    fields: [tenants.id],
    references: [tenantSettings.tenantId],
  }),
  organisations: many(organisations),
  branches: many(branches),
  departments: many(departments),
  employees: many(employees),
  projects: many(projects),
  tasks: many(tasks),
  conversations: many(conversations),
  conversationMembers: many(conversationMembers),
  messages: many(messages),
  notifications: many(notifications),
  userTenants: many(userTenants),
  roles: many(roles),
  userRoles: many(userRoles),
  auditLogs: many(auditLogs),
  invitations: many(invitations),
  shifts: many(shifts),
  holidays: many(holidays),
  attendanceRecords: many(attendanceRecords),
  leaveTypes: many(leaveTypes),
  leaveAllocations: many(leaveAllocations),
  leaveRequests: many(leaveRequests),
  performanceCycles: many(performanceCycles),
  performanceReviews: many(performanceReviews),
  hrDocumentMetadata: many(hrDocumentMetadata),
  hrResignations: many(hrResignations),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [organisations.tenantId],
    references: [tenants.id],
  }),
  branches: many(branches),
  departments: many(departments),
  employees: many(employees),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [branches.tenantId],
    references: [tenants.id],
  }),
  organisation: one(organisations, {
    fields: [branches.organisationId],
    references: [organisations.id],
  }),
  employees: many(employees),
  holidays: many(holidays),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  userTenants: many(userTenants),
  refreshTokens: many(refreshTokens),
  userRoles: many(userRoles),
  auditLogs: many(auditLogs),
  conversationMembers: many(conversationMembers),
  messages: many(messages),
  messageReactions: many(messageReactions),
  receivedNotifications: many(notifications, { relationName: 'recipientUser' }),
  sentNotifications: many(notifications, { relationName: 'actorUser' }),
  sentInvitations: many(invitations, { relationName: 'invitingUser' }),
  employeeProfile: one(employees, {
    fields: [users.id],
    references: [employees.userId],
  }),
}));

export const userTenantsRelations = relations(userTenants, ({ one }) => ({
  user: one(users, {
    fields: [userTenants.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [userTenants.tenantId],
    references: [tenants.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [roles.tenantId],
    references: [tenants.id],
  }),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
  invitations: many(invitations),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  tenant: one(tenants, {
    fields: [userRoles.tenantId],
    references: [tenants.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [departments.tenantId],
    references: [tenants.id],
  }),
  organisation: one(organisations, {
    fields: [departments.organisationId],
    references: [organisations.id],
  }),
  departmentHead: one(employees, {
    fields: [departments.departmentHeadId],
    references: [employees.id],
    relationName: 'departmentHead',
  }),
  employees: many(employees, {
    relationName: 'departmentEmployees',
  }),
  projects: many(projects),
  creator: one(users, {
    fields: [departments.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [departments.updatedBy],
    references: [users.id],
  }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [employees.tenantId],
    references: [tenants.id],
  }),
  organisation: one(organisations, {
    fields: [employees.organisationId],
    references: [organisations.id],
  }),
  branch: one(branches, {
    fields: [employees.branchId],
    references: [branches.id],
  }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
    relationName: 'departmentEmployees',
  }),
  manager: one(employees, {
    fields: [employees.managerEmployeeId],
    references: [employees.id],
    relationName: 'reportingHierarchy',
  }),
  directReports: many(employees, {
    relationName: 'reportingHierarchy',
  }),
  ownedProjects: many(projects, {
    relationName: 'projectOwner',
  }),
  projectMemberships: many(projectMembers),
  assignedTasks: many(tasks, {
    relationName: 'taskAssignee',
  }),
  reportedTasks: many(tasks, {
    relationName: 'taskReporter',
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [employees.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [employees.updatedBy],
    references: [users.id],
  }),
  invitations: many(invitations),
  shiftAssignments: many(employeeShifts),
  attendanceRecords: many(attendanceRecords),
  attendanceRegularizations: many(attendanceRegularizations),
  leaveAllocations: many(leaveAllocations),
  leaveRequests: many(leaveRequests),
  performanceReviews: many(performanceReviews, {
    relationName: 'employeePerformanceReview',
  }),
  assignedReviews: many(performanceReviews, {
    relationName: 'reviewerPerformanceReview',
  }),
  onboardingTasks: many(hrOnboardingTasks, {
    relationName: 'employeeOnboardingTasks',
  }),
  assignedOnboardingTasks: many(hrOnboardingTasks, {
    relationName: 'assigneeOnboardingTasks',
  }),
  lifecycleEvents: many(hrLifecycleEvents),
  resignations: many(hrResignations, {
    relationName: 'employeeResignation',
  }),
  reviewedResignations: many(hrResignations, {
    relationName: 'reviewerResignation',
  }),
  clearedExitChecklists: many(hrExitChecklists),
  documentMetadata: many(hrDocumentMetadata, {
    relationName: 'employeeDocumentMetadata',
  }),
  verifiedDocumentMetadata: many(hrDocumentMetadata, {
    relationName: 'verifierDocumentMetadata',
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  owner: one(employees, {
    fields: [projects.ownerEmployeeId],
    references: [employees.id],
    relationName: 'projectOwner',
  }),
  department: one(departments, {
    fields: [projects.departmentId],
    references: [departments.id],
  }),
  members: many(projectMembers),
  tasks: many(tasks),
  conversations: many(conversations),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [projects.updatedBy],
    references: [users.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [projectMembers.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  employee: one(employees, {
    fields: [projectMembers.employeeId],
    references: [employees.id],
  }),
  adder: one(users, {
    fields: [projectMembers.addedBy],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tasks.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(employees, {
    fields: [tasks.assigneeEmployeeId],
    references: [employees.id],
    relationName: 'taskAssignee',
  }),
  reporter: one(employees, {
    fields: [tasks.reporterEmployeeId],
    references: [employees.id],
    relationName: 'taskReporter',
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'subtasks',
  }),
  subtasks: many(tasks, {
    relationName: 'subtasks',
  }),
  comments: many(taskComments),
  activity: many(taskActivity),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [tasks.updatedBy],
    references: [users.id],
  }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [taskComments.tenantId],
    references: [tenants.id],
  }),
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  author: one(users, {
    fields: [taskComments.authorUserId],
    references: [users.id],
  }),
}));

export const taskActivityRelations = relations(taskActivity, ({ one }) => ({
  tenant: one(tenants, {
    fields: [taskActivity.tenantId],
    references: [tenants.id],
  }),
  task: one(tasks, {
    fields: [taskActivity.taskId],
    references: [tasks.id],
  }),
  actor: one(users, {
    fields: [taskActivity.actorUserId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [conversations.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [conversations.createdBy],
    references: [users.id],
  }),
  directUser1: one(users, {
    fields: [conversations.directUser1Id],
    references: [users.id],
    relationName: 'directUser1',
  }),
  directUser2: one(users, {
    fields: [conversations.directUser2Id],
    references: [users.id],
    relationName: 'directUser2',
  }),
  members: many(conversationMembers),
  messages: many(messages),
  notifications: many(notifications),
}));

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [conversationMembers.tenantId],
    references: [tenants.id],
  }),
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [messages.tenantId],
    references: [tenants.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToMessageId],
    references: [messages.id],
    relationName: 'messageReplies',
  }),
  replies: many(messages, {
    relationName: 'messageReplies',
  }),
  reactions: many(messageReactions),
  attachments: many(attachments),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [messageReactions.tenantId],
    references: [tenants.id],
  }),
  message: one(messages, {
    fields: [messageReactions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReactions.userId],
    references: [users.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [attachments.tenantId],
    references: [tenants.id],
  }),
  message: one(messages, {
    fields: [attachments.messageId],
    references: [messages.id],
  }),
  uploader: one(users, {
    fields: [attachments.uploadedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
    relationName: 'recipientUser',
  }),
  actor: one(users, {
    fields: [notifications.actorUserId],
    references: [users.id],
    relationName: 'actorUser',
  }),
  conversation: one(conversations, {
    fields: [notifications.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [notifications.messageId],
    references: [messages.id],
  }),
}));

// ==========================================
// HR MODULE RELATIONS
// ==========================================

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [shifts.tenantId],
    references: [tenants.id],
  }),
  employeeShifts: many(employeeShifts),
  attendanceRecords: many(attendanceRecords),
}));

export const employeeShiftsRelations = relations(employeeShifts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [employeeShifts.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [employeeShifts.employeeId],
    references: [employees.id],
  }),
  shift: one(shifts, {
    fields: [employeeShifts.shiftId],
    references: [shifts.id],
  }),
  assigner: one(users, {
    fields: [employeeShifts.assignedBy],
    references: [users.id],
  }),
}));

export const holidaysRelations = relations(holidays, ({ one }) => ({
  tenant: one(tenants, {
    fields: [holidays.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [holidays.applicableBranchId],
    references: [branches.id],
  }),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [attendanceRecords.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [attendanceRecords.employeeId],
    references: [employees.id],
  }),
  shift: one(shifts, {
    fields: [attendanceRecords.shiftId],
    references: [shifts.id],
  }),
  regularizations: many(attendanceRegularizations),
}));

export const attendanceRegularizationsRelations = relations(attendanceRegularizations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [attendanceRegularizations.tenantId],
    references: [tenants.id],
  }),
  attendanceRecord: one(attendanceRecords, {
    fields: [attendanceRegularizations.attendanceRecordId],
    references: [attendanceRecords.id],
  }),
  employee: one(employees, {
    fields: [attendanceRegularizations.employeeId],
    references: [employees.id],
  }),
  reviewer: one(employees, {
    fields: [attendanceRegularizations.reviewedByEmployeeId],
    references: [employees.id],
  }),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [leaveTypes.tenantId],
    references: [tenants.id],
  }),
  allocations: many(leaveAllocations),
  requests: many(leaveRequests),
}));

export const leaveAllocationsRelations = relations(leaveAllocations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [leaveAllocations.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [leaveAllocations.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveAllocations.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  tenant: one(tenants, {
    fields: [leaveRequests.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
  reviewer: one(employees, {
    fields: [leaveRequests.reviewedByEmployeeId],
    references: [employees.id],
  }),
}));

export const performanceCyclesRelations = relations(performanceCycles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [performanceCycles.tenantId],
    references: [tenants.id],
  }),
  reviews: many(performanceReviews),
}));

export const performanceReviewsRelations = relations(performanceReviews, ({ one }) => ({
  tenant: one(tenants, {
    fields: [performanceReviews.tenantId],
    references: [tenants.id],
  }),
  cycle: one(performanceCycles, {
    fields: [performanceReviews.cycleId],
    references: [performanceCycles.id],
  }),
  employee: one(employees, {
    fields: [performanceReviews.employeeId],
    references: [employees.id],
    relationName: 'employeePerformanceReview',
  }),
  reviewer: one(employees, {
    fields: [performanceReviews.reviewerEmployeeId],
    references: [employees.id],
    relationName: 'reviewerPerformanceReview',
  }),
}));

export const hrOnboardingTasksRelations = relations(hrOnboardingTasks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [hrOnboardingTasks.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [hrOnboardingTasks.employeeId],
    references: [employees.id],
    relationName: 'employeeOnboardingTasks',
  }),
  assignee: one(employees, {
    fields: [hrOnboardingTasks.assignedToEmployeeId],
    references: [employees.id],
    relationName: 'assigneeOnboardingTasks',
  }),
}));

export const hrLifecycleEventsRelations = relations(hrLifecycleEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [hrLifecycleEvents.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [hrLifecycleEvents.employeeId],
    references: [employees.id],
  }),
  recordedBy: one(users, {
    fields: [hrLifecycleEvents.recordedByUserId],
    references: [users.id],
  }),
}));

export const hrResignationsRelations = relations(hrResignations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [hrResignations.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [hrResignations.employeeId],
    references: [employees.id],
    relationName: 'employeeResignation',
  }),
  reviewer: one(employees, {
    fields: [hrResignations.reviewedByEmployeeId],
    references: [employees.id],
    relationName: 'reviewerResignation',
  }),
  exitChecklists: many(hrExitChecklists),
}));

export const hrExitChecklistsRelations = relations(hrExitChecklists, ({ one }) => ({
  tenant: one(tenants, {
    fields: [hrExitChecklists.tenantId],
    references: [tenants.id],
  }),
  resignation: one(hrResignations, {
    fields: [hrExitChecklists.resignationId],
    references: [hrResignations.id],
  }),
  clearedBy: one(employees, {
    fields: [hrExitChecklists.clearedByEmployeeId],
    references: [employees.id],
  }),
}));

export const hrDocumentMetadataRelations = relations(hrDocumentMetadata, ({ one }) => ({
  tenant: one(tenants, {
    fields: [hrDocumentMetadata.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [hrDocumentMetadata.employeeId],
    references: [employees.id],
    relationName: 'employeeDocumentMetadata',
  }),
  verifiedBy: one(employees, {
    fields: [hrDocumentMetadata.verifiedByEmployeeId],
    references: [employees.id],
    relationName: 'verifierDocumentMetadata',
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invitations.tenantId],
    references: [tenants.id],
  }),
  employee: one(employees, {
    fields: [invitations.employeeId],
    references: [employees.id],
  }),
  role: one(roles, {
    fields: [invitations.roleId],
    references: [roles.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
    relationName: 'invitingUser',
  }),
}));
