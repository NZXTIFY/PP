import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

type ShowToast = (message: string, opts?: { undo?: () => void }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { id, message, undo: opts?.undo }]);
      setTimeout(() => dismiss(id), opts?.undo ? 6000 : 3000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.undo && (
              <button
                className="toast-undo"
                onClick={() => {
                  t.undo!();
                  dismiss(t.id);
                }}
              >
                Ångra
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
