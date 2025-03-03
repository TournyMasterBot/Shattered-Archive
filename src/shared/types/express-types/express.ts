import "express";
import JwtAuth from "@shared/types/express-types/jwt.auth";

declare global {
  namespace Express {
    interface Request {
      authToken?: string;
      User?: JwtAuth;
      sessionID: string;
      shatteredSessionId?: string;
      requestId?: string;
      headers: any
    }
  }
}
