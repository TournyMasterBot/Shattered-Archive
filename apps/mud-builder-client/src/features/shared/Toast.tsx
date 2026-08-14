export type ToastKind = 'ok' | 'err' | 'warn' | 'info';
export type ToastState = { kind: ToastKind; text: string } | null;

/**
 * The one toast rendering (`mb-toast mb-toast--{kind}`, click-to-dismiss) every tab
 * shares — extracted (2026-07-26 UX polish pass) from `workbench.tsx`'s
 * `WorkbenchToast` so pages that don't use `useAreaWorkbench` (Scripts, Map, Engine,
 * Access, Skills) can stop hand-rolling an identical copy. Callers keep owning their
 * own toast STATE (`useState<ToastState>`) — this component is presentation only.
 */
export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className={`mb-toast mb-toast--${toast.kind}`} role="status" onClick={onDismiss}>
      {toast.text}
    </div>
  );
}
