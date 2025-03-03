import { doubleCsrf } from "csrf-csrf";
import { Request } from "express";
import ServerCache from "@shared/cache/server-cache";

const doubleCsrfOptions = {
 getSecret: () => ServerCache.jwtSecret,
  getSessionIdentifier: (req: Request) => req.sessionID || "",
  cookieName: "shatteredarchive.x-csrf-token",//"__Host-shatteredarchive.x-csrf-token",
  cookieOptions: {
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "prod", // Ensure this is true in production.
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"] as ("GET" | "HEAD" | "OPTIONS")[],
  // Retrieve the CSRF token from the x-csrf-token header.
  getTokenFromRequest: (req: Request) => {
    const token = req.headers["x-csrf-token"];
    return Array.isArray(token) ? token[0] : token ?? "";
  },
};

const { doubleCsrfProtection, generateToken } = doubleCsrf(doubleCsrfOptions);

export { doubleCsrfProtection, generateToken };
