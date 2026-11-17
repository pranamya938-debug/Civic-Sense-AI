import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'warning' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  tone = 'warning',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 ${tone === 'warning' ? 'text-amber-600' : 'text-emerald-700'}`}
            />
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-[#0B3B2E]">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md"
            aria-label="Close confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-neutral-600 leading-relaxed mb-6">{description}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              tone === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-[#0B3B2E] hover:bg-[#114B3B]'
            } disabled:opacity-60`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
