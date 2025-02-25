import { IAreaDetails } from "@shared/types/area-types/area-interface";
import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getRooms = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const roomNames = Object.keys(ServerCache.Rooms);
    response.setPayload(roomNames);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-rooms.unhandled.error",
      message: "Unhandled error while processing get-rooms",
      err: err,
    });
  }

  return response;
};

export const getRoom = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { roomName, descriptionFilter } = req.body;
  try {
    let result: IAreaDetails[] = [];
    const possibleRooms = ServerCache.Rooms[roomName];
    if (possibleRooms === undefined || Object.keys(possibleRooms).length === 0) {
      response.setPayload(result);
      return response;
    }
    const rooms = Object.values(possibleRooms);
    result = descriptionFilter?.length ? rooms.filter((room) => room.rawDesc?.toLowerCase().includes(descriptionFilter.toLowerCase())) : rooms;
    response.setPayload(result);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-room.unhandled.error",
      message: "Unhandled error while processing get-room",
      err: err,
    });
  }
  return response;
};
