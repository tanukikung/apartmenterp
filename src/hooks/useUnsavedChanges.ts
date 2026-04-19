'use client';

import { useEffect } from 'react';

/**
 * Warn the user before unloading the page (refresh, tab close, navigation)
 * if `dirty` is true. Uses the browser's native beforeunload dialog so the
 * actual message shown is controlled by the browser, but any non-empty
 * returnValue triggers the prompt.
 *
 * Pairs well with forms that keep local draft state.
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most modern browsers ignore the custom string but require setting returnValue.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
