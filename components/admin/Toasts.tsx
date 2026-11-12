"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const push = useCallback(
    (t: Omit<Toast, "id">, ms = 8000) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${
            t.kind === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          }`}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="font-bold underline underline-offset-2"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="閉じる" onClick={() => dismiss(t.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
