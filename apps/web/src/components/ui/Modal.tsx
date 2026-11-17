"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { Icon } from "./Icon";
import styles from "./Modal.module.css";

const CLOSE_ANIMATION_MS = 180;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** When false, Escape, the backdrop and the close button are all disabled. */
  dismissible?: boolean;
  children: ReactNode;
}

/** Accessible dialog built on the native element: focus trap, Escape and inert background come for free. */
export function Modal({ open, onClose, title, dismissible = true, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      delete dialog.dataset.closing;
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;

    dialog.dataset.closing = "true";
    const timer = window.setTimeout(() => dialog.close(), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (dismissible) onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === event.currentTarget) onClose();
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onCancel={handleCancel} onClick={handleBackdropClick}>
      <div className={styles.surface}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {dismissible && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close dialog">
              <Icon name="close" />
            </button>
          )}
        </header>
        {children}
      </div>
    </dialog>
  );
}
