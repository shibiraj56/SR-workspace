export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  phone?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'INVITED';
  lastLoginAt?: number | null;
  createdAt?: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isDefault?: boolean;
}

export interface AuthMeResponse {
  user: User;
  activeTenant: Tenant | null;
  tenants: Tenant[];
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  user: User;
  tenant: Tenant | null;
  roles: string[];
  permissions: string[];
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    status: number;
    details?: Array<{ field?: string; message: string }>;
  };
  meta?: {
    requestId?: string;
    timestamp?: number;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
