import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getAbilityGroup, getAbilityGroups } from "handlers/ability-handlers/ability-group-handlers";

const router = Router();

router.get("/get-ability-group/:abilityGroupName", asyncHandler(getAbilityGroup));
router.get("/get-ability-groups", asyncHandler(getAbilityGroups));


export default router;
