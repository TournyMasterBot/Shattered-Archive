import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type AccountSummary } from '../api/client.js';

export type AuthStatus = 'loading' | 'loggedOut' | 'mustChangePassword' | 'ready';

export interface AuthSession {
  status: AuthStatus;
  account: AccountSummary | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

function toStatus(account: AccountSummary | null): AuthStatus {
  if (!account) return 'loggedOut';
  return account.mustChangePassword ? 'mustChangePassword' : 'ready';
}

/** GET /api/auth/me on mount to establish logged-out / must-change-password / ready. */
export function useAuthSession(): AuthSession {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setAccount(me);
      setStatus(toStatus(me));
      setError(null);
    } catch (e) {
      // Any failure — expected 401 or a genuine server/network error — lands on the public
      // screen so the error (when present) is actually visible; 'loading' has nowhere to show it.
      setAccount(null);
      setStatus('loggedOut');
      setError(e instanceof ApiError && e.status === 401 ? null : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const summary = await api.login(username, password);
    setAccount(summary);
    setStatus(toStatus(summary));
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAccount(null);
    setStatus('loggedOut');
  }, []);

  return { status, account, error, refresh, login, logout };
}
