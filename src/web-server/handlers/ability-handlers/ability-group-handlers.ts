import MessageEnvelope from "@shared/types/express-types/message-envelope";
import ServerCache from "@shared/cache/server-cache";
import { Request, Response } from "express";

export const getAbilityGroups = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  try {
    const abilities = Object.keys(ServerCache.AbilityGroups);
    if(abilities === undefined) {
        response.addError({
            statusCode: 404,
            name: "ability-groups.length.notfound",
            message: "Unable to find requested abilities"
        });
        return response;
    }
    response.setPayload(abilities);
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

export const getAbilityGroup = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  const { abilityGroupName } = req.params;
  try {
    const ability = ServerCache.GetAbilityGroupByName(abilityGroupName);
    if(ability === undefined) {
        response.addError({
            statusCode: 404,
            name: "ability-group.notfound",
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
