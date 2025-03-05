// middleware.csrf.ts
import { doubleCsrf } from "csrf-csrf";
import { Request, Response, NextFunction } from "express";
import ServerCache from "@shared/cache/server-cache";

// Configure CSRF options. Note: We return a default value ("anonymous")
// if no sessionID exists.
const doubleCsrfOptions = {
  getSecret: () => ServerCache.jwtSecret,
  getSessionIdentifier: (req: Request) => req.sessionID || "anonymous",
  cookieName: "shatteredarchive.x-csrf-token", // or "__Host-shatteredarchive.x-csrf-token" in production
  cookieOptions: {
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "prod", // true in production when using HTTPS
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"] as ("GET" | "HEAD" | "OPTIONS")[],
  getTokenFromRequest: (req: Request) => {
    const token = req.headers["x-csrf-token"];
    return Array.isArray(token) ? token[0] : token ?? "";
  },
};

// Destructure the original CSRF utilities.
const { doubleCsrfProtection: originalDoubleCsrfProtection, generateToken } = doubleCsrf(doubleCsrfOptions);

/**
 * Wrapped CSRF middleware.
 * This wrapper calls the original middleware inside a try/catch.
 * If an error is thrown synchronously, it passes the error to next().
 */
export const doubleCsrfProtection = (req: Request, res: Response, next: NextFunction) => {
  try {
    return originalDoubleCsrfProtection(req, res, next);
  } catch (err) {
    return res.status(500).json(err);
  }
};

export { generateToken };
