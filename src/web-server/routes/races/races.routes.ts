import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getRace, getRaces } from "handlers/race-handlers/race-handlers";

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
 *             $ref: '#/components/schemas/Error'
 *     Error:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: integer
 *         name:
 *           type: string
 *         message:
 *           type: string
 *         err:
 *           type: object
 *           nullable: true
 *     Race:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         imageUrl:
 *           type: string
 *         displayName:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         isLimitedRace:
 *           type: boolean
 *         isMortalRace:
 *           type: boolean
 *         isLargeRace:
 *           type: boolean
 *         stats:
 *           type: array
 *           items:
 *             type: object
 *         primaryAttributeModifier:
 *           type: object
 *         secondaryAttributeModifier:
 *           type: object
 *         immunities:
 *           type: array
 *           items:
 *             type: object
 *         resistances:
 *           type: array
 *           items:
 *             type: object
 *         vulnerabilities:
 *           type: array
 *           items:
 *             type: object
 *         racialAbilities:
 *           type: array
 *           items:
 *             type: object
 *         availableClasses:
 *           type: array
 *           items:
 *             type: object
 *         restrictedClasses:
 *           type: array
 *           items:
 *             type: object
 *         boostedClasses:
 *           type: object
 *           additionalProperties:
 *             type: array
 *             items:
 *               type: object
 */
router.get("/", (req, res) => {
  res.send("Hello from Race Home!");
});

/**
 * @openapi
 * /races/get-race/{raceName}:
 *   post:
 *     summary: Retrieve details for a specific race.
 *     parameters:
 *       - in: path
 *         name: raceName
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the race to retrieve.
 *     responses:
 *       200:
 *         description: Race details returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   $ref: '#/components/schemas/Race'
 *                 errors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Error'
 *       404:
 *         description: Race not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEnvelope'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEnvelope'
 */
router.get("/get-race/:raceName", asyncHandler(getRace));
/**
 * @openapi
 * /races/get-races:
 *   get:
 *     summary: Retrieve a list of race names.
 *     responses:
 *       200:
 *         description: A list of race names.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   type: array
 *                   items:
 *                     type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEnvelope'
 */
router.get("/get-races", asyncHandler(getRaces));

export default router;
