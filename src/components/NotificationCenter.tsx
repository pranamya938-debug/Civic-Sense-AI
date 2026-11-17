import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { AppNotification } from '../shared/types';
import {
  markAllNotificationsReadInFirestore,
  markNotificationReadInFirestore,
} from '../services/firestoreService';

interface NotificationCenterProps {
  open: boolean;
  notifications: AppNotification[];
  onClose: () => void;
  onSelectComplaint?: (complaintId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  open,
  notifications,
  onClose,
  onSelectComplaint,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white h-full border-l border-neutral-200 flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[#0B3B2E]" />
            <h2 className="text-base font-semibold text-[#0B3B2E]">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={() => void markAllNotificationsReadInFirestore(notifications)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-500 hover:text-neutral-800 rounded-md cursor-pointer"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              No notifications yet. Complaint submissions, assignments, and status updates will appear here in real time.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 transition-colors ${n.read ? 'bg-white' : 'bg-emerald-50/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#0B3B2E]">{n.title}</div>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-neutral-500 mt-2">
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                      {n.complaintId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectComplaint && n.complaintId) {
                                onSelectComplaint(n.complaintId);
                                onClose();
                              }
                            }}
                            className="text-emerald-700 hover:underline font-medium cursor-pointer"
                          >
                            View {n.complaintId}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => void markNotificationReadInFirestore(n.id)}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-900 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
