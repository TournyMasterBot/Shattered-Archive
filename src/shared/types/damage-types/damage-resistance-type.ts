import { baseDamageType } from "./damage-type";

export const DslDamageResistanceType = {
  ...baseDamageType,
  Fire: "fire",
  Cold: "cold",
} as const;
export type DslDamageResistanceType = (typeof DslDamageResistanceType)[keyof typeof DslDamageResistanceType];
