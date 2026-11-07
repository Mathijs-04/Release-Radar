import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * true (default): Escape, a click on the backdrop and the ✕ button close it.
   * false: it only closes through its own buttons (e.g. Cancel), so work in
   * progress, like a game you're adding, can't be lost by accident.
   */
  dismissible?: boolean;
}

/** Native <dialog> modal: focus trapping and top-layer stacking for free. */
export function Modal({ open, onClose, title, children, footer, size = 'md', dismissible = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal() moves focus to the first focusable element; prefer an explicit target.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Safety net: if the browser closed a dialog that should stay open, reopen it on the next render.
  useEffect(() => {
    const el = ref.current;
    if (open && !dismissible && el && !el.open) el.showModal();
  });

  // Events from inside the dialog also reach these handlers: a file input's
  // "cancel" when its picker is dismissed, or the "close" of a nested dialog.
  // Only react to events that are about this dialog itself.
  const isOwn = (e: React.SyntheticEvent) => e.target === ref.current;

  return (
    <dialog
      ref={ref}
      className={`modal modal--${size}`}
      onCancel={(e) => {
        if (!isOwn(e)) return;
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={(e) => {
        if (!isOwn(e) || !open) return;
        // The browser closed it on its own (e.g. repeated Escape presses).
        if (dismissible) onClose();
        else queueMicrotask(() => ref.current && !ref.current.open && ref.current.showModal());
      }}
      onMouseDown={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel).
        if (dismissible && isOwn(e)) onClose();
      }}
    >
      {open && (
        <div className="modal__panel">
          <header className="modal__header">
            <h2>{title}</h2>
            {dismissible && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
