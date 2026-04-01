'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const success = useCallback((message: string) => toast(message, 'success'), [toast]);
  const error = useCallback((message: string) => toast(message, 'error'), [toast]);
  const info = useCallback((message: string) => toast(message, 'info'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl anim-fade-in',
              t.variant === 'success'
                ? 'border-tertiary-container bg-tertiary-container/20 text-on-tertiary-container'
                : t.variant === 'error'
                ? 'border-error-container bg-error-container/20 text-on-error-container'
                : 'border-primary-container bg-primary-container/20 text-primary',
            ].join(' ')}
          >
            {t.variant === 'success' ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : t.variant === 'error' ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
