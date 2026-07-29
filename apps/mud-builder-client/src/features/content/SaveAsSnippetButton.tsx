import { useState } from 'react';

import { api, type SnippetKind } from '../../api/client.js';
import { useIsAccountActor } from '../auth/accountActor.js';
import { Toast, type ToastState } from '../shared/Toast.js';

interface Props {
  kind: SnippetKind;
  /** The current in-editor value, captured as-is — the snippet is a private copy, never linked back to this entity. */
  data: unknown;
}

/**
 * Phase G: a small "Save as snippet" action embedded in each of the Room/Mob/Object/Script
 * editors. Hidden entirely (not shown-then-403'd) for anonymous/master/local-key callers,
 * since none of those have an accountId to save a snippet under — mirrors this app's
 * existing "hide what you can't do" convention (RolesPage, AdminPage in auth-client).
 * Shared across all four editors rather than duplicated per-editor since the logic (prompt,
 * fetch-mutate-save, toast) is identical regardless of which entity kind is being saved.
 */
export default function SaveAsSnippetButton({ kind, data }: Props) {
  const isAccountActor = useIsAccountActor();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  if (!isAccountActor) return null;

  const save = async () => {
    const name = window.prompt(`Save this ${kind} as a snippet named:`)?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { snippets } = await api.snippets();
      const now = new Date().toISOString();
      const next = [...snippets, { id: crypto.randomUUID(), kind, name, data, createdAt: now, updatedAt: now }];
      await api.saveSnippets(next);
      setToast({ kind: 'ok', text: `saved snippet "${name}" — find it on the My Content tab` });
    } catch (e) {
      setToast({ kind: 'err', text: `save snippet failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="mb-save-snippet">
      <button type="button" className="mb-ref-link" onClick={() => void save()} disabled={busy}>
        Save as snippet
      </button>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </span>
  );
}
