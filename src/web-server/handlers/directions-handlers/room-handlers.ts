import MessageEnvelope from '@shared/types/express-types/message-envelope';
import ServerCache from 'cache/server-cache';
import { Request, Response } from 'express';

export const getRooms = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope();
  try {
    const roomNames = Object.keys(ServerCache.Rooms);
    response.payload = roomNames;
  } catch(err) {
    console.error("Failed to get rooms", {
        err: err
    });
    response.errors!.push({
        statusCode: 500,
        name: "get-rooms.unhandled.error",
        message: "Unhandled error while processing get-rooms",
    })
  }
  
  return response;
};
