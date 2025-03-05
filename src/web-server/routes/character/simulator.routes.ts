import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { simulateStraightCp } from "handlers/character-handlers/creation-simulator";

const router = Router();

router.post("/simulators/creation", asyncHandler(simulateStraightCp));


export default router;
