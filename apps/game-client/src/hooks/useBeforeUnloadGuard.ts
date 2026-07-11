// apps/game-client/src/hooks/useBeforeUnloadGuard.ts
import { useEffect, useRef } from 'react';

/**
 * Prompts the browser's native "Leave site?" confirmation when the tab/window
 * is closed (or reloaded) while `active` is true. Used to guard against
 * accidentally tearing down an active play-server connection.
 *
 * The listener is attached ONCE for the lifetime of the component and reads the
 * latest `active` value from a ref, so there is no add/remove churn or
 * dependency-timing window where the guard could be momentarily detached.
 *
 * Note: modern browsers ignore any custom message and show their own generic
 * copy. They also only show the dialog at all if the page has "sticky
 * activation" (the user has interacted with it since load) — a browser security
 * rule we cannot override from script.
 */
export function useBeforeUnloadGuard(active: boolean): void {
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      // Standards-based path (Chrome/Edge >= 119, Firefox).
      e.preventDefault();
      // Legacy path (older Chrome, Safari): returnValue must be TRUTHY.
      e.returnValue = true;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
