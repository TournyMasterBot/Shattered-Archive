import { useCallback, useEffect, useState } from 'react';

import { api, type Snippet, type SnippetKind } from '../../api/client.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import '../areas/areas.css';

const KIND_LABELS: Record<SnippetKind, string> = {
  room: 'Rooms',
  mob: 'Mobs',
  object: 'Objects',
  script: 'Scripts',
};
const KIND_ORDER: SnippetKind[] = ['room', 'mob', 'object', 'script'];

/**
 * My Content tab (Phase G): a builder's own private Room/Mob/Object/Script templates —
 * never touching the live area files. Server API is whole-collection (GET/PUT
 * /api/snippets), so every mutation here is "compute the new array, PUT it, replace local
 * state with the response" rather than a per-item route.
 */
export default function ContentPage({ onLoad }: { onLoad: (kind: SnippetKind, data: unknown) => void }) {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    try {
      setSnippets((await api.snippets()).snippets);
    } catch (e) {
      setToast({ kind: 'err', text: `content: ${(e as Error).message}` });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: Snippet[], okText: string) => {
    try {
      setSnippets((await api.saveSnippets(next)).snippets);
      setToast({ kind: 'ok', text: okText });
    } catch (e) {
      setToast({ kind: 'err', text: `content: ${(e as Error).message}` });
    }
  };

  const rename = (s: Snippet) => {
    const name = window.prompt('Rename snippet:', s.name)?.trim();
    if (!name || name === s.name || !snippets) return;
    void save(
      snippets.map((x) => (x.id === s.id ? { ...x, name, updatedAt: new Date().toISOString() } : x)),
      `renamed to "${name}"`,
    );
  };

  const remove = (s: Snippet) => {
    if (!snippets || !window.confirm(`Delete snippet "${s.name}"? This cannot be undone.`)) return;
    void save(
      snippets.filter((x) => x.id !== s.id),
      `deleted "${s.name}"`,
    );
  };

  return (
    <div className="mb-page">
      <h2>My Content</h2>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <p className="mb-muted">
        Private templates saved from a Room/Mob/Object/Script editor's "Save as snippet" button. These never touch
        the live area files — "Load into editor" adds a brand-new entity seeded from the snippet, on whichever area
        you have open in that tab.
      </p>

      {snippets === null ? (
        <p>Loading…</p>
      ) : snippets.length === 0 ? (
        <p>No snippets yet — use "Save as snippet" from any Room/Mob/Object/Script editor.</p>
      ) : (
        KIND_ORDER.map((kind) => {
          const items = snippets.filter((s) => s.kind === kind);
          if (items.length === 0) return null;
          return (
            <fieldset className="mb-fieldset" key={kind}>
              <legend>{KIND_LABELS[kind]}</legend>
              <ul className="mb-list">
                {items.map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong> <span className="mb-muted">updated {s.updatedAt.slice(0, 10)}</span>{' '}
                    <button type="button" onClick={() => onLoad(s.kind, s.data)}>
                      Load into editor
                    </button>{' '}
                    <button type="button" onClick={() => rename(s)}>
                      Rename
                    </button>{' '}
                    <button type="button" onClick={() => remove(s)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })
      )}
    </div>
  );
}
