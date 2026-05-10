"use client";

import { useEffect } from "react";
import { useUIStore, Toast as ToastType } from "@/stores/uiStore";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./Icon";

const typeStyles: Record<string, string> = {
  success: "bg-primary-container text-on-primary-container",
  error: "bg-error-container text-on-error-container",
  info: "bg-secondary-container text-on-secondary-container",
};

const typeIcons: Record<string, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
};

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useUIStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration ?? 3000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-[slideUp_0.3s_ease-out]",
        typeStyles[toast.type]
      )}
    >
      <Icon name={typeIcons[toast.type]!} className="text-[20px]" />
      <span className="font-body-md text-body-md flex-1">{toast.message}</span>
      <button onClick={() => removeToast(toast.id)} className="opacity-70 hover:opacity-100">
        <Icon name="close" className="text-[16px]" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);

  return (
    <div className="fixed bottom-24 lg:bottom-8 right-8 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
