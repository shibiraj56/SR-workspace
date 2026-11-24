import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { LogOut, User as UserIcon, Shield, ChevronDown } from 'lucide-react';
import { NotificationBell } from '@/features/communication/components/notification-bell';

export function Header() {
  const { user, activeTenant, roles, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = `${user?.firstName?.[0] || 'U'}${user?.lastName?.[0] || ''}`.toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-neutral-200 px-6 flex items-center justify-between z-10 shrink-0">
      {/* Left side: Context badge */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
          Overview
        </h2>
        {activeTenant && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 text-xs font-medium text-neutral-600 border border-neutral-200/60">
            <span>{activeTenant.name}</span>
            <span className="text-[10px] uppercase font-bold text-brand-600 bg-brand-50 px-1 rounded">
              {activeTenant.plan}
            </span>
          </div>
        )}
      </div>

      {/* Right side: Notifications & Profile Dropdown */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-neutral-100/70 transition-colors focus:outline-none"
        >
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs flex items-center justify-center border border-brand-200 shadow-xs">
            {initials}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-sm font-semibold text-neutral-900 leading-tight">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs text-neutral-500 leading-none mt-0.5">
              {user?.email}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white border border-neutral-200 rounded-xl shadow-lg py-2 z-50 text-sm">
            <div className="px-4 py-2.5 border-b border-neutral-100">
              <p className="font-semibold text-neutral-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-neutral-500 truncate mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                  <Shield className="w-3 h-3" />
                  {roles[0] || 'MEMBER'}
                </span>
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {user?.status || 'ACTIVE'}
                </span>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-neutral-100 text-xs text-neutral-500">
              <div className="flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span>Account ID: {user?.id.slice(0, 8)}...</span>
              </div>
            </div>

            <div className="p-1">
              <button
                onClick={async () => {
                  setDropdownOpen(false);
                  await logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium text-left"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
