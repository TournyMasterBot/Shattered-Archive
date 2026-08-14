import { useEffect, useState } from 'react';

import { api, type RolesMe } from '../../api/client.js';

/**
 * Phase G: whether the current stored token belongs to a centrally-authenticated account
 * (as opposed to the master key or a local API key — neither has an accountId to save
 * snippets under). Module-level cached: the Room/Mob/Object/Script editors can each mount
 * many simultaneous instances (e.g. every mob in an open Areas-dashboard room), and this
 * avoids firing one GET /api/roles/me per instance. Invalidated by AccessPage whenever the
 * stored token changes (save/forget) — the only place in this app that changes it.
 */
let cached: Promise<RolesMe> | null = null;

function fetchMe(): Promise<RolesMe> {
  cached ??= api.rolesMe().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  return cached;
}

export function invalidateAccountActorCache(): void {
  cached = null;
}

export function useIsAccountActor(): boolean {
  const [isAccount, setIsAccount] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => {
        if (alive) setIsAccount(me.kind === 'account');
      })
      .catch(() => {
        if (alive) setIsAccount(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return isAccount;
}
