import asyncHandler from "@shared/express-server/async-handler";
import { doubleCsrfProtection } from "@shared/express-server/middleware.csrf";
import { Router } from "express";
import { simulateStraightCp } from "handlers/character-handlers/creation-simulator";

const router = Router();

router.post("/simulators/creation", doubleCsrfProtection,asyncHandler(simulateStraightCp));


export default router;
