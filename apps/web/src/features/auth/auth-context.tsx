import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import type { User, Tenant, AuthMeResponse, LoginResponse } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  activeTenant: Tenant | null;
  tenants: Tenant[];
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await api.get<AuthMeResponse>('/api/v1/auth/me');
      setUser(data.user);
      setActiveTenant(data.activeTenant);
      setTenants(data.tenants || []);
      setRoles(data.roles || []);
      setPermissions(data.permissions || []);
    } catch (err) {
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setRoles([]);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await api.post<LoginResponse>('/api/v1/auth/login', {
      email,
      password,
    });

    setUser(data.user);
    setActiveTenant(data.tenant);
    setRoles(data.roles || []);
    setPermissions(data.permissions || []);

    // Also fetch full /me profile to hydrate full tenant lists
    await fetchCurrentUser();
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post('/api/v1/auth/logout', {});
    } catch {
      // Non-fatal logout cleanup
    } finally {
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setRoles([]);
      setPermissions([]);
    }
  };

  const value: AuthContextValue = {
    user,
    activeTenant,
    tenants,
    roles,
    permissions,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    refreshProfile: fetchCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
