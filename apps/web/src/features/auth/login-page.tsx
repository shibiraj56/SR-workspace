import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Building2 } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
      const destination = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        if (err.code === 'AUTH_INVALID_CREDENTIALS') {
          setErrorMessage('Invalid email or password. Please verify your credentials and try again.');
        } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
          setErrorMessage('Too many failed sign-in attempts. Please wait a moment before trying again.');
        } else if (err.code === 'AUTH_ACCOUNT_DISABLED') {
          setErrorMessage('This account is currently disabled or suspended. Please contact your system administrator.');
        } else {
          setErrorMessage(err.message || 'Authentication failed.');
        }
      } else {
        setErrorMessage('An unexpected network error occurred. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 text-white shadow-sm mb-3">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          SR WORKSPACE
        </h1>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500 mt-1">
          SR CODE LABS ENTERPRISE PORTAL
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white border border-neutral-200/80 rounded-2xl shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">Sign in to your account</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Enter your enterprise credentials to access your workspace.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-snug">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Work Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="name@company.com"
            error={validationErrors.email}
            leftIcon={<Mail className="w-4 h-4" />}
            disabled={isLoading}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (validationErrors.password) setValidationErrors((prev) => ({ ...prev, password: undefined }));
            }}
            placeholder="••••••••••••"
            error={validationErrors.password}
            leftIcon={<Lock className="w-4 h-4" />}
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="hover:text-neutral-700 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            disabled={isLoading}
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-400">
            Protected by Cloudflare Edge Security &amp; End-to-End Encryption
          </p>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} SR CODE LABS. All rights reserved.
      </div>
    </div>
  );
}
