import type { AppDatabase, User, Tenant } from '@sr-workspace/database';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
}

export interface ValidatedTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export interface Variables {
  requestId: string;
  db: AppDatabase;
  user?: AuthenticatedUser;
  tenantId?: string;
  tenant?: ValidatedTenant;
}

export interface HonoEnv {
  Bindings: import('./env').Bindings;
  Variables: Variables;
}
