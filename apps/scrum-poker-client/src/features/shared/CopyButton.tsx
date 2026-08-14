import { useCallback, useEffect, useState } from 'react';

/**
 * Copies `value` and confirms it inline for two seconds.
 *
 * `navigator.clipboard` is undefined on insecure origins and in some embedded browsers, so
 * the failure path falls back to selecting nothing and simply reporting that it didn't work
 * — sharing the invite link is the app's core action and must not silently no-op.
 */
export default function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }, [value]);

  return (
    <button type="button" className="sp-btn" onClick={copy}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
