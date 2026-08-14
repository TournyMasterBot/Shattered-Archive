import type { Request, Response } from 'express';

import { AuthError } from '../errors.js';

type Handler = (req: Request, res: Response) => void | Promise<void>;

/** Maps a thrown AuthError to its HTTP status; anything else is an unexpected 500. */
export function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(e.status).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  };
}
