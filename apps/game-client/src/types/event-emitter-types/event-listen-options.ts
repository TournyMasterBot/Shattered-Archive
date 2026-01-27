/**
 * Optional options bag for dedupe/debug.
 * If you don't pass options, nothing changes from your original behavior.
 */
export type ListenOptions = {
  /**
   * Unique key used to dedupe this subscription across HMR reloads.
   * If provided, we will auto-unsubscribe any prior listener with the same key.
   */
  key?: string;

  /**
   * Capture a stack trace for debug visibility.
   * Useful to see who registered a listener.
   */
  captureStack?: boolean;
};