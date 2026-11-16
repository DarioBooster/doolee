import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastNotice } from '../types/doolee.ts';

interface ToastListProps {
  toasts: ToastNotice[];
  onDismiss: (id: string) => void;
}

export function ToastList({ toasts, onDismiss }: ToastListProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-md flex-col gap-2 px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const styles =
          toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-900'
            : toast.type === 'success'
            ? 'border-teal-200 bg-teal-50 text-teal-950'
            : 'border-slate-200 bg-white text-slate-900';

        const Icon =
          toast.type === 'error'
            ? AlertCircle
            : toast.type === 'success'
            ? CheckCircle2
            : Info;

        const iconColor =
          toast.type === 'error'
            ? 'text-red-600'
            : toast.type === 'success'
            ? 'text-teal-700'
            : 'text-slate-600';

        return (
          <div
            key={toast.id}
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-sm ${styles}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fermer la notification"
              className="rounded p-1 text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
