import "express";
import JwtAuth from "@shared/types/express-types/jwt.auth";

declare global {
  namespace Express {
    interface Request {
      authToken?: string;
      User?: JwtAuth;
      shatteredSessionId?: string;
      traceId?: string;
    }
  }
}
