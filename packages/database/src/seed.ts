import * as schema from './schema';

export const DEFAULT_PERMISSIONS = [
  // Tenant Permissions
  { code: 'tenants:create', name: 'Create Tenants', module: 'tenants', action: 'create' },
  { code: 'tenants:read', name: 'View Tenants', module: 'tenants', action: 'read' },
  { code: 'tenants:update', name: 'Update Tenants', module: 'tenants', action: 'update' },
  { code: 'tenants:delete', name: 'Delete Tenants', module: 'tenants', action: 'delete' },

  // Organisation Permissions
  { code: 'organisations:create', name: 'Create Organisations', module: 'organisations', action: 'create' },
  { code: 'organisations:read', name: 'View Organisations', module: 'organisations', action: 'read' },
  { code: 'organisations:update', name: 'Update Organisations', module: 'organisations', action: 'update' },
  { code: 'organisations:delete', name: 'Delete Organisations', module: 'organisations', action: 'delete' },

  // Branch Permissions
  { code: 'branches:create', name: 'Create Branches', module: 'branches', action: 'create' },
  { code: 'branches:read', name: 'View Branches', module: 'branches', action: 'read' },
  { code: 'branches:update', name: 'Update Branches', module: 'branches', action: 'update' },
  { code: 'branches:delete', name: 'Delete Branches', module: 'branches', action: 'delete' },

  // User Permissions
  { code: 'users:create', name: 'Create Users', module: 'users', action: 'create' },
  { code: 'users:read', name: 'View Users', module: 'users', action: 'read' },
  { code: 'users:update', name: 'Update Users', module: 'users', action: 'update' },
  { code: 'users:delete', name: 'Delete Users', module: 'users', action: 'delete' },
  { code: 'users:assign_role', name: 'Assign Roles to Users', module: 'users', action: 'assign_role' },

  // Role & Permission Permissions
  { code: 'roles:create', name: 'Create Roles', module: 'roles', action: 'create' },
  { code: 'roles:read', name: 'View Roles', module: 'roles', action: 'read' },
  { code: 'roles:update', name: 'Update Roles', module: 'roles', action: 'update' },
  { code: 'roles:delete', name: 'Delete Roles', module: 'roles', action: 'delete' },
  { code: 'permissions:read', name: 'View Permissions', module: 'permissions', action: 'read' },

  // Audit Log Permissions
  { code: 'audit:read', name: 'View Audit Logs', module: 'audit', action: 'read' },
  { code: 'audit:export', name: 'Export Audit Logs', module: 'audit', action: 'export' },

  // Settings Permissions
  { code: 'settings:read', name: 'View Settings', module: 'settings', action: 'read' },
  { code: 'settings:update', name: 'Update Settings', module: 'settings', action: 'update' },

  // Project Permissions
  { code: 'projects:read', name: 'View Projects', module: 'projects', action: 'read' },
  { code: 'projects:create', name: 'Create Projects', module: 'projects', action: 'create' },
  { code: 'projects:update', name: 'Update Projects', module: 'projects', action: 'update' },
  { code: 'projects:delete', name: 'Delete Projects', module: 'projects', action: 'delete' },
  { code: 'projects:manage_members', name: 'Manage Project Members', module: 'projects', action: 'manage_members' },

  // Task Permissions
  { code: 'tasks:read', name: 'View Tasks', module: 'tasks', action: 'read' },
  { code: 'tasks:create', name: 'Create Tasks', module: 'tasks', action: 'create' },
  { code: 'tasks:update', name: 'Update Tasks', module: 'tasks', action: 'update' },
  { code: 'tasks:delete', name: 'Delete Tasks', module: 'tasks', action: 'delete' },
  { code: 'tasks:assign', name: 'Assign Tasks', module: 'tasks', action: 'assign' },
  { code: 'tasks:manage_comments', name: 'Manage Task Comments', module: 'tasks', action: 'manage_comments' },
];

export const SYSTEM_ROLES = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Full system access across all tenants and configuration',
    roleType: 'SYSTEM' as const,
    isDefault: false,
  },
  {
    code: 'TENANT_ADMIN',
    name: 'Tenant Administrator',
    description: 'Full administrative access within the tenant organization',
    roleType: 'SYSTEM' as const,
    isDefault: false,
  },
  {
    code: 'ORG_ADMIN',
    name: 'Organisation Administrator',
    description: 'Administrative access to assigned organisation and branches',
    roleType: 'SYSTEM' as const,
    isDefault: false,
  },
  {
    code: 'BRANCH_MANAGER',
    name: 'Branch Manager',
    description: 'Operational management of a specific branch location',
    roleType: 'SYSTEM' as const,
    isDefault: false,
  },
  {
    code: 'EMPLOYEE',
    name: 'Standard Employee',
    description: 'Standard access for business collaboration and tasks',
    roleType: 'SYSTEM' as const,
    isDefault: true,
  },
  {
    code: 'VIEWER',
    name: 'Read-Only Viewer',
    description: 'Read-only access across assigned resources',
    roleType: 'SYSTEM' as const,
    isDefault: false,
  },
];
