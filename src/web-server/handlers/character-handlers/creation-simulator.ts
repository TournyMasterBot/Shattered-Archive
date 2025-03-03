import MessageEnvelope from "@shared/types/express-types/message-envelope";
import { Request, Response } from "express";

export const simulateStraightCp = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    return response;
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-ability-groups.unhandled.error",
      message: "Unhandled error while processing get-ability-groups",
      err: err,
    });
  }
  return response;
};