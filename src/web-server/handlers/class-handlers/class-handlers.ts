import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getClasses = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const classNames = Object.keys(ServerCache.Classes);
    response.setPayload(classNames);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-classes.unhandled.error",
      message: "Unhandled error while processing get-classes",
      err: err,
    });
  }

  return response;
};

export const getClass = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { className } = req.params;
  try {
    const lookupByName = className.trim();
    const dslClass = ServerCache.GetClassByName(lookupByName);
    if(dslClass === undefined) {
        response.addError({
            statusCode: 404,
            name: "class.notfound",
            message: "Unable to find requested class"
        });
        return response;
    }
    response.setPayload(dslClass);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-class.unhandled.error",
      message: "Unhandled error while processing get-class",
      err: err,
    });
  }
  return response;
};
