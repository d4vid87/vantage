'use client';
import { useEffect, useRef } from 'react';

/** Non-modal panel: focus on open, Escape from within, restore its launcher. */
export function usePanel<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => (ref.current?.querySelector<HTMLElement>('[data-panel-autofocus]') ?? ref.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]'))?.focus());
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) {
        e.preventDefault(); e.stopImmediatePropagation(); close.current();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
