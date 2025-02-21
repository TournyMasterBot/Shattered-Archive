import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "cache/server-cache";
import { Request, Response } from "express";

export const getAreas = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const areas = Object.keys(ServerCache.Areas);
    response.setPayload(areas);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-races.unhandled.error",
      message: "Unhandled error while processing get-races",
      err: err,
    });
  }

  return response;
};

export const getArea = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { areaName } = req.body;
  try {
    // Fetch possible rooms
    const key = areaName.trim();
    const area = ServerCache.GetAreaByName(key);
    if(area === undefined) {
        response.addError({
            statusCode: 404,
            name: "area.notfound",
            message: "Unable to find requested area"
        });
        return response;
    }
    // Set return payload
    response.setPayload(area);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-area.unhandled.error",
      message: "Unhandled error while processing get-area",
      err: err,
    });
  }
  return response;
};
