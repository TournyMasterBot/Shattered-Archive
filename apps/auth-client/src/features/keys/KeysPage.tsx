import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type ApiKeyInfo } from '../../api/client.js';

/**
 * `service` is purely a label on the issued key (auth-server's /api/introspect never
 * filters on it — see routes/introspect.ts) but a free-text field let users create keys
 * tagged for a service that either doesn't exist or is spelled inconsistently across
 * their own keys. This is the list of services that actually consume introspection
 * today (mud-builder-server registered its Ed25519 key via `register-service` — see
 * docs/auth-server.md). Add a new entry here once another service registers for real.
 */
const KNOWN_SERVICES = ['mud-builder-server'] as const;

/** List/create/rotate/revoke API keys — structurally mirrors mud-builder-client's AccessPage key panel. */
export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState('');
  const [label, setLabel] = useState('');
  const [freshToken, setFreshToken] = useState<{ what: string; token: string } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listKeys();
      setKeys(r.keys);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (what: string, action: () => Promise<void>) => {
    try {
      await action();
      setToast({ kind: 'ok', text: `${what} — done` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
    }
  };

  const createKey = () =>
    run(`create key "${label.trim()}"`, async () => {
      const issued = await api.createKey(service.trim(), label.trim(), null);
      setFreshToken({ what: `API key "${issued.label ?? label.trim()}"`, token: issued.token });
      setService('');
      setLabel('');
      await load();
    });

  const rotateKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Rotate "${k.label}"? Its current token stops working immediately.`)) return;
    void run(`rotate key "${k.label}"`, async () => {
      const issued = await api.rotateKey(k.id);
      setFreshToken({ what: `API key "${k.label}" (rotated)`, token: issued.token });
      await load();
    });
  };

  const revokeKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Revoke "${k.label}"? This cannot be undone (create a new key instead).`)) return;
    void run(`revoke key "${k.label}"`, async () => {
      await api.revokeKey(k.id);
      await load();
    });
  };

  const copyFresh = () => {
    if (freshToken) void navigator.clipboard?.writeText(freshToken.token);
  };

  return (
    <div className="auc-page">
      <h2>API keys</h2>
      {toast ? (
        <p className={toast.kind === 'ok' ? 'auc-toast auc-toast--ok' : 'auc-toast auc-toast--err'}>{toast.text}</p>
      ) : null}

      {freshToken ? (
        <fieldset className="auc-fieldset">
          <legend>New token — shown only once</legend>
          <p>{freshToken.what}: store this now; only a hash is kept on the server.</p>
          <input aria-label="Issued token" readOnly value={freshToken.token} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copyFresh}>
            Copy
          </button>
          <button type="button" onClick={() => setFreshToken(null)}>
            Dismiss
          </button>
        </fieldset>
      ) : null}

      <fieldset className="auc-fieldset">
        <legend>Your keys</legend>
        {loading ? (
          <p>Loading…</p>
        ) : keys.length === 0 ? (
          <p>No API keys yet.</p>
        ) : (
          <ul className="auc-list">
            {keys.map((k) => (
              <li key={k.id}>
                <strong>{k.label}</strong> <span className="auc-muted">({k.service})</span> <code>{k.id}</code> · created{' '}
                {k.createdAt.slice(0, 10)}
                {k.revokedAt ? (
                  <em> · revoked {k.revokedAt.slice(0, 10)}</em>
                ) : (
                  <>
                    {' '}
                    <button type="button" onClick={() => rotateKey(k)}>
                      Rotate
                    </button>{' '}
                    <button type="button" onClick={() => revokeKey(k)}>
                      Revoke
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="auc-fieldset">
        <legend>Create a new key</legend>
        <label className="auc-field">
          <span>Service</span>
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Select a service…</option>
            {KNOWN_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="auc-field">
          <span>Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. laptop, ci driver" />
        </label>
        <button
          type="button"
          onClick={() => void createKey()}
          disabled={service.trim().length === 0 || label.trim().length === 0}
        >
          Create API key
        </button>
      </fieldset>
    </div>
  );
}
