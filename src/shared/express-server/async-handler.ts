import MessageEnvelope from "@shared/types/express-types/message-envelope";
import { Request, Response, NextFunction, RequestHandler } from "express";

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .then((result: MessageEnvelope) => {
        if (result.statusCode! >= 400 && result.statusCode != 404) {
          console.error("Error encountered during request", {
            sessionId: req.shatteredSessionId,
            requestId: req.requestId,
            path: req.path,
            result: JSON.stringify(result, null, 2),
          });
        }
        
        // Append information
        result.sessionId = req.sessionID;
        result.requestId = req.requestId;
        return res.status(result.statusCode!).json(result);
      })
      .catch(next);
  };
};

export default asyncHandler;
