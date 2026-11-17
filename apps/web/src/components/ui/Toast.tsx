"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";
import styles from "./Toast.module.css";

type Tone = "success" | "error" | "neutral";

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  notify: (message: string, tone?: Tone) => void;
}

const DISMISS_MS = 4000;
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

const GLYPH: Record<Tone, IconName> = { success: "check", error: "close", neutral: "info" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((message: string, tone: Tone = "neutral") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), DISMISS_MS);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.p
              key={toast.id}
              layout
              className={styles.toast}
              data-tone={toast.tone}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: DURATION.fast } }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
            >
              <span className={styles.glyph} aria-hidden="true">
                <Icon name={GLYPH[toast.tone]} />
              </span>
              {toast.message}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
