import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getItems = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    let items: {[key: string]: string } = {};
    for(const key of Object.keys(ServerCache.Items)) {
      const item = ServerCache.Items[key];
      items[item.item_hash] = item.item_name;
    }
    response.setPayload(items);
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

export const getItem = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { itemKey } = req.params;
  try {
    const key = itemKey.toLowerCase().trim();
    const item = ServerCache.GetItemById(key);
    if(item === undefined) {
        response.addError({
            statusCode: 404,
            name: "item.notfound",
            message: "Unable to find requested item"
        });
        return response;
    }
    response.setPayload(item);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-item.unhandled.error",
      message: "Unhandled error while processing get-item",
      err: err,
    });
  }
  return response;
};
