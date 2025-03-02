import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getAbilities = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const abilities = Object.keys(ServerCache.Abilities);
    if(abilities === undefined) {
        response.addError({
            statusCode: 404,
            name: "abilities.length.notfound",
            message: "Unable to find requested abilities"
        });
        return response;
    }
    response.setPayload(abilities);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-abilities.unhandled.error",
      message: "Unhandled error while processing get-abilities",
      err: err,
    });
  }
  return response;
};

export const getAbility = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { abilityName } = req.params;
  try {
    const ability = ServerCache.GetAbilityByName(abilityName);
    if(ability === undefined) {
        response.addError({
            statusCode: 404,
            name: "ability.notfound",
            message: "Unable to find requested ability"
        });
        return response;
    }
    response.setPayload(ability);
  } catch (err: any) {
    response.addError({
      statusCode: 500,
      name: "get-ability.unhandled.error",
      message: "Unhandled error while processing get-ability",
      err: err,
    });
  }
  return response;
};
