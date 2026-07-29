import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type AdminUsersPage, type AdminService, type TempPasswordResult } from '../../api/client.js';

const PAGE_SIZE = 25;

/** Where each constellation service administers its OWN delegated roles — link-outs, never replication (cross-cutting rule). */
const SERVICE_ADMIN_LINKS: Record<string, string> = {
  'mud-builder-server': 'https://build.shatteredarchive.dev',
};

/**
 * A2 hub admin: strictly-below user management + the delegation surface. The
 * UI hides what the actor can't do (unmanageable rows get no controls; the
 * role select only offers assignableTiers from the server) but the API is the
 * enforcement — forcing a request past the UI still 403s.
 */
export default function AdminPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AdminUsersPage | null>(null);
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oneTime, setOneTime] = useState<TempPasswordResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPage(await api.adminListUsers(search, offset, PAGE_SIZE));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to load users');
    }
  }, [search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .adminServices()
      .then(({ services }) => setServices(services))
      .catch(() => setServices([]));
  }, []);

  const changeRole = async (id: string, username: string, role: string) => {
    if (!window.confirm(`Set ${username}'s global role to ${role}?`)) return;
    setBusyId(id);
    try {
      await api.adminSetRole(id, role);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'role change failed');
    } finally {
      setBusyId(null);
    }
  };

  const issueTempPassword = async (id: string, username: string) => {
    if (!window.confirm(`Issue a one-time recovery password for ${username}? Every session and key they hold becomes invalid.`)) return;
    setBusyId(id);
    try {
      setOneTime(await api.adminTempPassword(id));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'temp-password failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="auc-page auc-page--wide">
      <h2>User management</h2>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      {oneTime ? (
        <div className="auc-toast auc-toast--ok">
          <p>
            One-time password for <strong>{oneTime.username}</strong>:
          </p>
          <input aria-label="One-time password" readOnly value={oneTime.temporaryPassword} onFocus={(e) => e.currentTarget.select()} />
          <p className="auc-muted">{oneTime.note}</p>
          <button type="button" onClick={() => setOneTime(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <form
        className="auc-search"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setSearch(query.trim());
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search usernames" aria-label="Search users" />
        <button type="submit">Search</button>
      </form>

      {page ? (
        <>
          <table className="auc-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Created</th>
                <th>Credentials</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {page.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {u.mustChangePassword ? <span className="auc-muted"> (must change password)</span> : null}
                  </td>
                  <td>{u.globalRole}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="auc-muted">
                    {u.counts.api} keys · {u.counts.session} sessions{u.counts.sso ? ` · ${u.counts.sso} sso` : ''}
                  </td>
                  <td>
                    {u.manageable ? (
                      <span className="auc-row-actions">
                        <select
                          aria-label={`Set role for ${u.username}`}
                          value={u.globalRole}
                          disabled={busyId === u.id}
                          onChange={(e) => void changeRole(u.id, u.username, e.target.value)}
                        >
                          {[...new Set([u.globalRole, ...page.assignableTiers, 'user'])].map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={busyId === u.id} onClick={() => void issueTempPassword(u.id, u.username)}>
                          Temp password
                        </button>
                      </span>
                    ) : (
                      <span className="auc-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="auc-pager">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              ← Prev
            </button>
            <span className="auc-muted">
              {page.total === 0 ? 'no users' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} of ${page.total}`}
            </span>
            <button type="button" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next →
            </button>
          </div>
        </>
      ) : (
        <p className="auc-muted">Loading…</p>
      )}

      <h2>Constellation services</h2>
      <p className="auc-muted">
        Domain roles are delegated: each service administers its own tiers from its own UI — the hub only links out.
      </p>
      {services === null ? (
        <p className="auc-muted">Loading…</p>
      ) : services.length === 0 ? (
        <p className="auc-muted">No services registered.</p>
      ) : (
        <ul className="auc-list">
          {services.map((s) => (
            <li key={s.serviceName}>
              <strong>{s.serviceName}</strong>{' '}
              <span className="auc-muted">
                ({s.activeKeys} active key{s.activeKeys === 1 ? '' : 's'}
                {s.redirectUris.length ? `, SSO: ${s.redirectUris.join(', ')}` : ''})
              </span>{' '}
              {SERVICE_ADMIN_LINKS[s.serviceName] ? (
                <a href={SERVICE_ADMIN_LINKS[s.serviceName]} target="_blank" rel="noreferrer">
                  Manage on site →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
