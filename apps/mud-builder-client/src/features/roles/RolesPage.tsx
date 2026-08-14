import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type RoleGrant, type RolesMe, type ServiceTier } from '../../api/client.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import '../areas/areas.css';

/**
 * Roles tab (Phase G): mud-builder's own delegated role store (Decision 4). Shows the
 * caller's own standing (local tier + hub global role) always; the management table only
 * renders when GET /api/roles succeeds — a 403 there just means "you can't manage roles
 * here," not an error, so it's treated as "hide the table," matching AccessPage's own
 * open-vs-gated section pattern. Same "UI hides what you can't do, server enforces it
 * for real" rule as auth-client's AdminPage.
 */

const ASSIGNABLE_TIERS: ServiceTier[] = ['admin', 'manager', 'trusted', 'user'];

export default function RolesPage() {
  const [me, setMe] = useState<RolesMe | null>(null);
  const [grants, setGrants] = useState<RoleGrant[] | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [accountId, setAccountId] = useState('');
  const [username, setUsername] = useState('');
  const [tier, setTier] = useState<ServiceTier>('user');
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.rolesMe());
    } catch (e) {
      setToast({ kind: 'err', text: `roles: ${(e as Error).message}` });
    }
  }, []);

  const loadGrants = useCallback(async () => {
    try {
      setGrants((await api.rolesList()).grants);
    } catch (e) {
      setGrants(null);
      // A 403 here just means "you can't manage roles" — not an error to surface. Anything
      // else (network failure, 401, 500) is a real problem worth a toast.
      if (!(e instanceof ApiError && e.status === 403)) {
        setToast({ kind: 'err', text: `roles list: ${(e as Error).message}` });
      }
    }
  }, []);

  useEffect(() => {
    void loadMe();
    void loadGrants();
  }, [loadMe, loadGrants]);

  const grant = async () => {
    const id = accountId.trim();
    if (!id) return;
    setBusy(true);
    try {
      await api.setRole(id, tier, username.trim() || undefined);
      setToast({ kind: 'ok', text: `granted "${tier}" to ${id}` });
      setAccountId('');
      setUsername('');
      setTier('user');
      await loadGrants();
    } catch (e) {
      setToast({ kind: 'err', text: `grant failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-page">
      <h2>Roles</h2>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <fieldset className="mb-fieldset">
        <legend>Your access</legend>
        {me === null ? (
          <p>Loading…</p>
        ) : (
          <p>
            {me.kind === 'master' ? (
              <>Master key — every action in this app is available to you, including granting roles.</>
            ) : me.kind === 'key' ? (
              <>Local API key — this service's role store has nothing to say about a key; ask an operator for the master key or a hub account grant.</>
            ) : (
              <>
                Local tier: <strong>{me.localTier}</strong>
                {me.globalRole && me.globalRole !== 'user' ? (
                  <>
                    {' '}
                    · hub global role: <strong>{me.globalRole}</strong>
                  </>
                ) : null}
              </>
            )}
          </p>
        )}
      </fieldset>

      {grants === null ? null : (
        <fieldset className="mb-fieldset">
          <legend>Manage grants</legend>
          {grants.length === 0 ? <p>No grants yet.</p> : null}
          <ul className="mb-list">
            {grants.map((g) => (
              <li key={g.accountId}>
                <strong>{g.username}</strong> <code>{g.accountId}</code> — {g.tier} (granted by {g.grantedBy},{' '}
                {g.grantedAt.slice(0, 10)})
              </li>
            ))}
          </ul>
          <label className="mb-field">
            Account ID
            <input
              aria-label="Account ID to grant"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="paste from the hub's Admin page or an audit-log line"
            />
          </label>
          <label className="mb-field">
            Username (optional, for readability only)
            <input aria-label="Username label" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="mb-field">
            Tier
            <select aria-label="Tier to grant" value={tier} onChange={(e) => setTier(e.target.value as ServiceTier)}>
              {ASSIGNABLE_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <p className="mb-muted">
            'owner' cannot be granted from this screen — it is set only by editing roles.json on the host, same as the
            master key.
          </p>
          <button type="button" onClick={() => void grant()} disabled={busy || accountId.trim().length === 0}>
            Grant
          </button>
        </fieldset>
      )}
    </div>
  );
}
