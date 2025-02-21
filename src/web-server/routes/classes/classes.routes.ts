import asyncHandler from "@shared/express-server/async-handler";
import { Router } from "express";
import { getClass, getClasses } from "handlers/class-handlers/class-handlers";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     IDslClass:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         displayName:
 *           type: string
 *         isMortalClass:
 *           type: boolean
 *         isReclass:
 *           type: boolean
 *         isCsr:
 *           type: boolean
 *         baseClass:
 *           $ref: '#/components/schemas/IClassType'
 *         classType:
 *           $ref: '#/components/schemas/IClassType'
 *         imgUrl:
 *           type: string
 *         primaryAttribute:
 *           $ref: '#/components/schemas/IStatAttribute'
 *         secondaryAttribute:
 *           $ref: '#/components/schemas/IStatAttribute'
 *         armorType:
 *           $ref: '#/components/schemas/IDslArmorType'
 *         classGroup:
 *           type: string
 *         raceRestrictions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/IRace'
 *         characterCreationAbilityGroups:
 *           type: object
 *           additionalProperties:
 *             type: number
 *         characterCreationSkills:
 *           type: object
 *           additionalProperties:
 *             type: number
 *         abilities:
 *           type: object
 *           description: Mapping from level to array of abilities.
 *           additionalProperties:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/IAbility'
 *         baseCpModifier:
 *           type: number
 *         helpfile:
 *           type: string
 *         castsAtLevel:
 *           type: boolean
 *         castingLevelModifier:
 *           type: number
 *         notes:
 *           type: string
 *         cpRacialModifiers:
 *           type: object
 *           additionalProperties:
 *             type: number
 *         buffActions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/IAbility'
 *         isMoonAffected:
 *           type: boolean
 */
router.get("/", (req, res) => {
  res.send("Hello from Race Home!");
});
/**
 * @openapi
 * /classes/get-class/{className}:
 *   get:
 *     summary: Retrieve a specific class by name.
 *     parameters:
 *       - name: className
 *         in: path
 *         description: The name of the class to retrieve.
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Class object retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IDslClass'
 *       404:
 *         description: Unable to find requested class.
 *       500:
 *         description: Unhandled error while processing get-class.
 */
router.get("/get-class/:className", asyncHandler(getClass));
/**
 * @openapi
 * /classes/get-classes:
 *   get:
 *     summary: Retrieve a list of available class names.
 *     responses:
 *       200:
 *         description: A list of class names.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Unhandled error while processing get-classes.
 */
router.get("/get-classes", asyncHandler(getClasses));

export default router;
