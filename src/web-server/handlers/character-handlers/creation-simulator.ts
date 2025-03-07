import ArgumentNull, { ArgumentNullError } from "@shared/types/error-types/argument-null-error";
import MessageEnvelope from "@shared/types/express-types/message-envelope";
import { Request, Response } from "express";
import CharacterSimulator from "features/simulators/character/character-simulator";

export const simulateStraightCp = async (req: Request, res: Response): Promise<MessageEnvelope> => {
  let response: MessageEnvelope = new MessageEnvelope(req);
  console.log("Request", {
    req: JSON.stringify(req.body)
  });
  try {
    const { cpCost, racialModifier } = req.body;
    const result = CharacterSimulator.CalculateCp(cpCost, racialModifier);
    response.payload = result;
  } catch (err: any) {
    console.log("Failed to process simulation request", {
      err: err.message
    });
    if (err instanceof ArgumentNullError) {
      response.addError({
        statusCode: 400,
        name: "argument.null.error",
        message: err.message,
        err: err,
      });
    } else {
      response.addError({
        statusCode: 500,
        name: "get-ability-groups.unhandled.error",
        message: "Unhandled error while processing get-ability-groups",
        err: err,
      });
    }
  }
  return response;
};