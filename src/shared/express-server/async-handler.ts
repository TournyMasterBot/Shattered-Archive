import { Request, Response, NextFunction, RequestHandler } from "express";

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .then((result) => {
        if (result !== undefined) {
          // Unset errors before response
          if (result.errors?.length ?? 0 === 0) {
            result.errors = undefined;
          }
          // unset status code
          const responseCode = result.statusCode;
          result.statusCode = undefined;
          res.status(responseCode).json(result);
        }
      })
      .catch(next);
  };
};

export default asyncHandler;
