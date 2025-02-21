import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getItem, getItems } from "handlers/items-handlers/item-handlers";

const router = Router();

router.get("/", (req, res) => {
  res.send("Hello from Items Home!");
});
router.get("/get-item/:itemKey", asyncHandler(getItem));
router.get("/get-items", asyncHandler(getItems));


export default router;
