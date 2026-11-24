import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { communicationApi } from '../api/communication-api';
import type { NotificationItem } from '@/types/communication';
import { Bell, CheckCheck, X, MessageSquare, Loader2 } from 'lucide-react';

function formatNotificationTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await communicationApi.getNotificationUnreadCount();
      const count = res.unreadCount ?? res.count ?? 0;
      setUnreadCount(count);
    } catch {
      // tolerate network error
    }
  }, []);

  // Fetch notifications list
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await communicationApi.listNotifications({ limit: 30 });
      setNotifications(res.items || []);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial and periodic unread count poll
  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // When opening popover, load list and refresh count
  const handleToggleOpen = () => {
    if (!isOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (notificationId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await communicationApi.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // non-fatal
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await communicationApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // non-fatal
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleDismiss = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await communicationApi.dismissNotification(notificationId);
      const target = notifications.find((n) => n.id === notificationId);
      if (target && !target.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch {
      // non-fatal
    }
  };

  const handleClickNotification = async (n: NotificationItem) => {
    if (!n.isRead) {
      handleMarkAsRead(n.id);
    }
    setIsOpen(false);
    if (n.conversationId) {
      navigate(`/communication?id=${n.conversationId}`);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggleOpen}
        title="Notifications"
        className="relative p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 text-sm overflow-hidden flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/50">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-neutral-900 text-sm">Notifications</h4>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-neutral-400">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600 mb-1" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-400 px-4">
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => {
                const actorName = n.actor
                  ? `${n.actor.firstName} ${n.actor.lastName}`
                  : 'System';
                const initials = n.actor
                  ? `${n.actor.firstName[0] || ''}${n.actor.lastName[0] || ''}`.toUpperCase()
                  : 'S';

                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={`p-3 cursor-pointer transition-colors flex items-start gap-3 hover:bg-neutral-50/80 ${
                      !n.isRead ? 'bg-brand-50/30' : ''
                    }`}
                  >
                    {/* Actor avatar */}
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-neutral-900 truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-neutral-400 shrink-0 ml-1">
                          {formatNotificationTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    </div>

                    {/* Dismiss / Mark-as-read buttons */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {!n.isRead && (
                        <span
                          className="w-2 h-2 rounded-full bg-brand-600 shrink-0"
                          title="Unread"
                        />
                      )}
                      <button
                        onClick={(e) => handleDismiss(n.id, e)}
                        className="text-neutral-400 hover:text-neutral-600 p-1 rounded transition-colors"
                        title="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
