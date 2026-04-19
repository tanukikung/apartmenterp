'use client';

import { useEffect } from 'react';

type Modifier = 'ctrl' | 'meta' | 'shift' | 'alt';

interface ShortcutOptions {
  key: string; // e.g. '/', 'k', 'Escape'
  modifiers?: Modifier[]; // combinations like ['meta'] for Cmd+K
  onTrigger: (e: KeyboardEvent) => void;
  /** Allow the shortcut to fire when focus is inside an input/textarea. Default false. */
  allowInInput?: boolean;
  /** Disable the binding without unmounting the hook. */
  disabled?: boolean;
}

/**
 * Register a global keyboard shortcut. Ignores key events when focus is inside
 * a text input/textarea/contentEditable unless `allowInInput` is true.
 */
export function useKeyboardShortcut({
  key,
  modifiers = [],
  onTrigger,
  allowInInput = false,
  disabled = false,
}: ShortcutOptions): void {
  useEffect(() => {
    if (disabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== key) return;

      const needsCtrl = modifiers.includes('ctrl');
      const needsMeta = modifiers.includes('meta');
      const needsShift = modifiers.includes('shift');
      const needsAlt = modifiers.includes('alt');

      if (needsCtrl !== e.ctrlKey) return;
      if (needsMeta !== e.metaKey) return;
      if (needsShift !== e.shiftKey) return;
      if (needsAlt !== e.altKey) return;

      if (!allowInInput) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            target.isContentEditable
          ) {
            return;
          }
        }
      }

      onTrigger(e);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, modifiers, onTrigger, allowInInput, disabled]);
}
