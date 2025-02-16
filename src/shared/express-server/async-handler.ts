import MessageEnvelope from "@shared/types/express-types/message-envelope";
import { Request, Response, NextFunction, RequestHandler } from "express";

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .then((result: MessageEnvelope) => {
        if (result !== undefined) {
          // Unset errors before response
          if (result.errors?.length ?? 0 === 0) {
            result.errors = undefined;
          }

          // Ensure issues are logged
          if (result.statusCode! >= 400 && result.statusCode != 404) {
            console.error("Error encountered during request", {
              sessionId: req.shatteredSessionId,
              requestId: req.traceId,
              path: req.path,
              result: result,
            });
          }

          // unset errors if not defined
          if (result.errors === undefined || result.errors?.length === 0) {
            result.errors = undefined;
          }

          // unset status code
          const responseCode = result.statusCode!;
          result.statusCode = undefined;
          result.unsetInternalErrors();
          res.status(responseCode).json(result);
        }
      })
      .catch(next);
  };
};

export default asyncHandler;
