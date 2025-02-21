import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getArea, getAreas } from "handlers/areas-handlers/areas-handlers";

const router = Router();

router.post("/get-area", asyncHandler(getArea));
router.get("/get-areas", asyncHandler(getAreas));


export default router;
