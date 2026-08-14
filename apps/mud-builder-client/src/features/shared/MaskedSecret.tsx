import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Show-once secret display that is safe to have on screen while sharing or streaming.
 *
 * Device credentials removed the everyday need to display a secret at all, but a few
 * break-glass paths genuinely must reveal one exactly once — an issued API key, a rotated
 * master key, a one-time password. Those are precisely the moments someone is most likely to
 * be on a call walking an operator through setup.
 *
 * Behaviour, and the reasoning for each part:
 *  - Masked by default. Revealing is a deliberate act, never the initial state.
 *  - Copy works WITHOUT revealing, so the common case never puts the value on screen at all.
 *  - Auto re-hides after a short timeout — the realistic failure is forgetting it is visible,
 *    not being unable to read it in time.
 *  - Re-hides immediately on `visibilitychange` (tab switch / screen-share app switching) and
 *    on window blur. This is the case that actually bites: you reveal the key, alt-tab to
 *    paste it somewhere, and the shared view lingers on a screen you are no longer looking at.
 *
 * Deliberately NOT claimed: this cannot stop a screenshot taken while revealed, and it is not
 * a substitute for not displaying secrets — it just narrows the window from "until dismissed"
 * to "a few seconds of deliberate action".
 */

const DEFAULT_REVEAL_MS = 15_000;
/** Fixed-width mask so the rendered width never hints at the secret's length. */
const MASK = '•'.repeat(24);

export interface MaskedSecretProps {
  value: string;
  /** Accessible name, e.g. "Issued token". */
  label: string;
  revealMs?: number;
  onCopied?: () => void;
}

export function MaskedSecret({ value, label, revealMs = DEFAULT_REVEAL_MS, onCopied }: MaskedSecretProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    setRevealed(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    setRevealed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(false), revealMs);
  }, [revealMs]);

  // Hide whenever attention leaves this window. Registered only while revealed so there is no
  // listener churn in the overwhelmingly common masked state.
  useEffect(() => {
    if (!revealed) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', hide);
    };
  }, [revealed, hide]);

  // Never leave a timer behind on unmount.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (no permission, or an insecure context) — revealing is the only way
      // left to transcribe it, so say so rather than failing silently.
      reveal();
    }
  };

  return (
    <div className="mb-masked-secret">
      <input
        aria-label={label}
        readOnly
        // type=password keeps it out of the accessibility tree's plain text and out of
        // browser autofill heuristics while masked.
        type={revealed ? 'text' : 'password'}
        value={revealed ? value : MASK}
        onFocus={(e) => revealed && e.target.select()}
      />
      <button type="button" onClick={revealed ? hide : reveal}>
        {revealed ? 'Hide' : 'Reveal'}
      </button>
      <button type="button" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="mb-hint">
        {revealed
          ? 'Visible — hides itself shortly, and immediately if you switch away. Safe to copy without revealing.'
          : 'Hidden so it is safe on a shared screen. Copy works without revealing it.'}
      </p>
    </div>
  );
}
