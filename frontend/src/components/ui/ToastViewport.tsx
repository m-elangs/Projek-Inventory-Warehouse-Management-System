import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';

export function ToastViewport() {
  const { toasts, dismissToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const icon =
          t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
          ) : t.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-status-danger shrink-0 mt-0.5" />
          );

        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 bg-surface border border-line-strong rounded-md shadow-modal"
          >
            {icon}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-ink">{t.title}</p>
              {t.description && (
                <p className="text-xs text-ink-secondary mt-0.5 break-words">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-ink-muted hover:text-ink p-0.5"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
