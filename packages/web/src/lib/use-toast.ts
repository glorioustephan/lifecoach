import { useEffect, useState } from "react";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastRecord extends ToastInput {
  id: string;
  createdAt: number;
}

type Listener = (toasts: ToastRecord[]) => void;

const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

let counter = 0;
let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();

const emit = () => {
  for (const l of listeners) l(toasts);
};

const push = (input: ToastInput): string => {
  const id = `t${++counter}`;
  const record: ToastRecord = {
    ...input,
    id,
    createdAt: Date.now(),
    variant: input.variant ?? "default",
    duration: input.duration ?? DEFAULT_DURATION,
  };
  toasts = [...toasts, record].slice(-MAX_TOASTS);
  emit();
  return id;
};

const dismiss = (id: string) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

interface ToastFn {
  (input: ToastInput): string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

export const toast: ToastFn = Object.assign(
  (input: ToastInput) => push(input),
  {
    success: (title: string, description?: string) =>
      push({ title, ...(description !== undefined ? { description } : {}), variant: "success" }),
    error: (title: string, description?: string) =>
      push({ title, ...(description !== undefined ? { description } : {}), variant: "error", duration: 8000 }),
    warning: (title: string, description?: string) =>
      push({ title, ...(description !== undefined ? { description } : {}), variant: "warning" }),
    info: (title: string, description?: string) =>
      push({ title, ...(description !== undefined ? { description } : {}), variant: "info" }),
    dismiss,
  },
);

export const useToast = () => {
  const [state, setState] = useState<ToastRecord[]>(toasts);
  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { toasts: state, dismiss };
};
