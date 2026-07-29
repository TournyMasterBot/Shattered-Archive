import type { NextFunction, Request, Response } from 'express';

/**
 * Guards the `/api/kt/*` account-scoped routes (match-history, army-layouts). Unlike the WS
 * `join` frame's `resolveAccountId` (which always degrades to anonymous on any failure — auth
 * there is additive, never a gate), these HTTP routes have no meaningful anonymous behavior:
 * "my match history" requires knowing who "my" is, so a missing/invalid/expired token is a
 * clean 401 here, not a silent fallback.
 */
export function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export function requireAccount(resolveAccountId: ((token: string) => Promise<string | undefined>) | undefined) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearerToken(req);
    const accountId = token && resolveAccountId ? await resolveAccountId(token) : undefined;
    if (!accountId) {
      res.status(401).json({ error: 'a valid bearer token is required' });
      return;
    }
    res.locals.accountId = accountId;
    next();
  };
}
