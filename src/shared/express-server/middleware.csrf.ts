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

export function csrfErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  // Check if the error is a CSRF error.
  if (err && (err.name === "ForbiddenError" || err.code === "EBADCSRFTOKEN")) {
    console.warn("CSRF error caught:", err.message);
    res.status(403).json({
      error: "Invalid CSRF token",
      message: "Your session may have expired. Please refresh and try again.",
    });
  } else {
    next(err);
  }
}

/**
 * Wrapped CSRF middleware.
 * This wrapper calls the original middleware inside a try/catch.
 * If an error is thrown synchronously, it passes the error to next().
 */
export const doubleCsrfProtection = (req: Request, res: Response, next: NextFunction) => {
  try {
    return originalDoubleCsrfProtection(req, res, next);
  } catch (err) {
    return csrfErrorHandler(err, req, res, next);
  }
};

export { generateToken };
