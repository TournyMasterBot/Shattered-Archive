import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, getStoredToken, setStoredToken, type ApiKeyInfo, type AuditEntry } from '../../api/client.js';
import '../areas/areas.css';

/**
 * Access tab (Phase 9): builder token entry plus — when the stored token is
 * the service MASTER key — the API-key management panel (create / rotate /
 * revoke, master rotation). Plaintext tokens appear exactly once, in the
 * show-once box right after create/rotate; only hashes exist server-side.
 *
 * Phase 4 (centralized auth): the token field is agnostic to WHERE a token
 * came from — a key minted through auth-client with service
 * "mud-builder-server" works here too (the server introspects it against
 * auth-server on a local miss), landing in the same 'key' status bucket as a
 * local API key since neither is master. No client-side change was needed
 * for the mechanism itself, only this status copy.
 */

type TokenStatus =
  | 'loading' // capabilities probe in flight
  | 'open' // server does not require a token
  | 'none' // token required, nothing stored
  | 'invalid' // stored token rejected (revoked/rotated/wrong)
  | 'key' // valid API key — saves work, no key management
  | 'master'; // master key — key management unlocked

const STATUS_TEXT: Record<TokenStatus, string> = {
  loading: 'Checking access…',
  open: 'This deployment does not require a builder token — saves follow the write gate only.',
  none: 'A builder token is required to save changes. Paste yours below (ask the operator, read the master key from builder-auth.json on the host, or — if this deployment runs the centralized auth service — log into auth-client and mint a key with service "mud-builder-server").',
  invalid: 'The stored token was REJECTED — it may have been revoked or rotated. Enter a current one.',
  key: 'Token accepted (API key). Saves are enabled in this browser.',
  master: 'Master key accepted — API keys can be managed below.',
};

export default function AccessPage() {
  const [status, setStatus] = useState<TokenStatus>('loading');
  const [tokenInput, setTokenInput] = useState('');
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [freshToken, setFreshToken] = useState<{ what: string; token: string } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  const loadAudit = useCallback(async () => {
    try {
      setAudit((await api.audit(100)).entries);
    } catch (e) {
      setToast({ kind: 'err', text: `audit log: ${(e as Error).message}` });
    }
  }, []);

  const probe = useCallback(async () => {
    try {
      const caps = await api.capabilities();
      if (!(caps.tokenRequired ?? false)) {
        setStatus('open');
        setKeys([]);
        return;
      }
      if (!getStoredToken()) {
        setStatus('none');
        setKeys([]);
        return;
      }
      try {
        const r = await api.authKeys();
        setStatus('master');
        setKeys(r.keys);
      } catch (e) {
        setStatus(e instanceof ApiError && e.status === 403 ? 'key' : 'invalid');
        setKeys([]);
      }
    } catch (e) {
      setToast({ kind: 'err', text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    if (status === 'master') void loadAudit();
    else setAudit(null);
  }, [status, loadAudit]);

  const saveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setStoredToken(token);
    setTokenInput('');
    await probe();
  };

  const forgetToken = async () => {
    setStoredToken('');
    await probe();
  };

  const run = async (what: string, action: () => Promise<void>) => {
    try {
      await action();
      setToast({ kind: 'ok', text: `${what} — done` });
    } catch (e) {
      setToast({ kind: 'err', text: (e as Error).message });
    }
  };

  const createKey = () =>
    run(`create key "${newLabel.trim()}"`, async () => {
      const issued = await api.createKey(newLabel.trim());
      setFreshToken({ what: `API key "${issued.label}"`, token: issued.token });
      setNewLabel('');
      await probe();
    });

  const rotateKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Rotate "${k.label}"? Its current token stops working immediately.`)) return;
    void run(`rotate key "${k.label}"`, async () => {
      const issued = await api.rotateKey(k.id);
      setFreshToken({ what: `API key "${issued.label}" (rotated)`, token: issued.token });
      await probe();
    });
  };

  const revokeKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Revoke "${k.label}"? This cannot be undone (create a new key instead).`)) return;
    void run(`revoke key "${k.label}"`, async () => {
      await api.revokeKey(k.id);
      await probe();
    });
  };

  const rotateMaster = () => {
    if (
      !window.confirm(
        'Rotate the MASTER key? Every copy of the current master key stops working immediately. This browser switches to the new one automatically.',
      )
    )
      return;
    void run('rotate master key', async () => {
      const issued = await api.rotateMaster();
      setStoredToken(issued.token);
      setFreshToken({ what: 'master key (rotated)', token: issued.token });
      await probe();
    });
  };

  const copyFresh = () => {
    if (freshToken) void navigator.clipboard?.writeText(freshToken.token);
  };

  return (
    <div className="mb-page">
      <h2>Access</h2>
      {toast ? <p className={toast.kind === 'ok' ? 'mb-toast mb-toast--ok' : 'mb-toast mb-toast--err'}>{toast.text}</p> : null}
      <p>{STATUS_TEXT[status]}</p>

      {status !== 'open' && status !== 'loading' ? (
        <fieldset className="mb-fieldset">
          <legend>Builder token</legend>
          <label className="mb-field">
            Token
            <input
              aria-label="Builder token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="paste token"
            />
          </label>
          <button type="button" onClick={() => void saveToken()} disabled={tokenInput.trim().length === 0}>
            Save token
          </button>
          {getStoredToken() ? (
            <button type="button" onClick={() => void forgetToken()}>
              Forget stored token
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {freshToken ? (
        <fieldset className="mb-fieldset">
          <legend>New token — shown only once</legend>
          <p>
            {freshToken.what}: store this now; only a hash is kept on the server.
          </p>
          <input aria-label="Issued token" readOnly value={freshToken.token} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copyFresh}>
            Copy
          </button>
          <button type="button" onClick={() => setFreshToken(null)}>
            Dismiss
          </button>
        </fieldset>
      ) : null}

      {status === 'master' ? (
        <fieldset className="mb-fieldset">
          <legend>API keys</legend>
          {keys.length === 0 ? <p>No API keys yet.</p> : null}
          <ul className="mb-list">
            {keys.map((k) => (
              <li key={k.id}>
                <strong>{k.label}</strong> <code>{k.id}</code> · created {k.createdAt.slice(0, 10)}
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
          <label className="mb-field">
            New key label
            <input
              aria-label="New key label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. laptop, ci driver"
            />
          </label>
          <button type="button" onClick={() => void createKey()} disabled={newLabel.trim().length === 0}>
            Create API key
          </button>
          <hr />
          <button type="button" onClick={rotateMaster}>
            Rotate master key
          </button>
        </fieldset>
      ) : null}

      {status === 'master' ? (
        <fieldset className="mb-fieldset">
          <legend>Audit log</legend>
          <p className="mb-muted">
            Every accepted mutation (newest first, last 100). The log itself is append-only on the server.
          </p>
          <button type="button" onClick={() => void loadAudit()}>
            Refresh
          </button>
          {audit === null ? (
            <p>Loading…</p>
          ) : audit.length === 0 ? (
            <p>No audited mutations yet.</p>
          ) : (
            <table className="mb-audit-table" aria-label="Audit entries">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e, i) => (
                  <tr key={`${e.ts ?? 'raw'}-${i}`}>
                    {e.raw !== undefined ? (
                      <td colSpan={3}>
                        <code>{e.raw}</code>
                      </td>
                    ) : (
                      <>
                        <td>{(e.ts ?? '').replace('T', ' ').slice(0, 19)}</td>
                        <td>
                          <code>
                            {e.method} {e.route}
                          </code>
                        </td>
                        <td>{e.actor}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
