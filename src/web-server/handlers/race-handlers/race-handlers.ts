import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getRaces = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const raceNames = Object.keys(ServerCache.Races);
    response.setPayload(raceNames);
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

export const getRace = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { raceName } = req.params;
  try {
    // Fetch possible rooms
    const lookupByName = raceName.trim();
    const race = ServerCache.GetRaceByName(lookupByName);
    if(race === undefined) {
        response.addError({
            statusCode: 404,
            name: "race.notfound",
            message: "Unable to find requested race"
        });
        return response;
    }
    // Set return payload
    response.setPayload(race);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-race.unhandled.error",
      message: "Unhandled error while processing get-race",
      err: err,
    });
  }
  return response;
};
