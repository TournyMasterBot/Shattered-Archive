import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getRoom, getRooms } from "handlers/directions-handlers/room-handlers";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MessageEnvelope:
 *       type: object
 *       properties:
 *         payload:
 *           type: object
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               statusCode:
 *                 type: number
 *               name:
 *                 type: string
 *               message:
 *                 type: string
 *       example:
 *         payload: { key: "value" }
 *         errors: null
 */

router.get("/", (req, res) => {
  res.send("Hello from Directions Home!");
});

/**
 * @openapi
 * /get-room:
 *   post:
 *     summary: Get details for a specific room.
 *     description: Returns room details that match the given description filter.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roomName:
 *                 type: string
 *                 description: The name of the room.
 *               descriptionFilter:
 *                 type: string
 *                 description: Filter applied on room's description.
 *             required:
 *               - roomName
 *     responses:
 *       200:
 *         description: A MessageEnvelope containing an array of room details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEnvelope'
 *       500:
 *         description: Unhandled error while processing get-room.
 */
router.post("/get-room", asyncHandler(getRoom));

/**
 * @openapi
 * /get-rooms:
 *   get:
 *     summary: Get list of available room names.
 *     description: Returns an array of room names from the server cache.
 *     responses:
 *       200:
 *         description: A MessageEnvelope containing an array of room names.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEnvelope'
 *       500:
 *         description: Unhandled error while processing get-rooms.
 */
router.get("/get-rooms", asyncHandler(getRooms));

export default router;
