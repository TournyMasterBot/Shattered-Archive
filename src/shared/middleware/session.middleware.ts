import JwtAuth from '@shared/types/express-types/jwt.auth';
import { Request, Response, NextFunction } from 'express';
import { v4 } from 'uuid';

const sessionIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Retrieve the header. HTTP headers are case-insensitive.
  const sessionId = req.get('X-Shattered-Session-Id');
  const authToken = req.get('Authorization');
  if(authToken !== undefined && authToken.length > 0) {
    const user = parseAuthToken(authToken);
    if(user !== undefined) {
        req.User = user;
    }
  }
  req.shatteredSessionId = sessionId;
  req.traceId = v4();
  next();
};

function parseAuthToken(token: string): JwtAuth | undefined {
    try {
        throw new Error("Not implemented");
    }
    catch(err: any) {
        return undefined;
    } 
}

export default sessionIdMiddleware;