import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getAbilities, getAbility } from "handlers/ability-handlers/item-handlers";

const router = Router();

router.get("/", (req, res) => {
  res.send("Hello from Abilities Home!");
});
router.get("/get-ability/:abilityName", asyncHandler(getAbility));
router.get("/get-abilities", asyncHandler(getAbilities));


export default router;
