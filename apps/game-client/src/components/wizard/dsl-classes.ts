// apps/game-client/src/components/wizard/dsl-classes.ts

/**
 * Static fallback for the wizard's class picker — used ONLY when the served class
 * catalog (`autoleveling-classes.ts` → `GET /maps/autoleveling/classes`) is
 * unreachable and its offline JSON is also empty. The real list (all playable
 * classes + their abilities) comes from the C# service.
 *
 * Just the five base classes — enough to key the per-(area, class) fight overlay
 * and pick a rotation from `BUFF_CATALOG` / manual entry while offline.
 */
export const DSL_CLASSES_FALLBACK: readonly string[] = ['Bard', 'Cleric', 'Mage', 'Thief', 'Warrior'];
