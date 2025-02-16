import { IDamageType } from "@shared/types/damage-types/damage-type-interface";
import { DslDamageCategoryType } from "@shared/types/damage-types/damage-category-type";
import { DslDamageResistanceType } from "@shared/types/damage-types/damage-resistance-type";
import DslError from "@shared/types/error-types/dsl-error";

export const baseDamageType = {
  Unknown: "unknown",
  AcidicBite: "acbite",
  Beating: "beating",
  Bite: "bite",
  Blast: "blast",
  Charge: "charge",
  Chill: "chill",
  Chop: "chop",
  Claw: "claw",
  Cleave: "cleave",
  Crush: "crush",
  Divine: "divine",
  Drain: "drain",
  Flame: "flame",
  FlamingBite: "flbite",
  FreezingBite: "frbite",
  Grep: "grep",
  Magic: "magic",
  None: "none",
  Peck: "peck",
  Pierce: "pierce",
  Pound: "pound",
  Punch: "punch",
  Scratch: "scratch",
  ShockingBite: "shbite",
  Shock: "shock",
  Slap: "slap",
  Slash: "slash",
  Slice: "slice",
  Slime: "slime",
  Smash: "smash",
  Stab: "stab",
  Sting: "sting",
  Suction: "suction",
  Thrust: "thrust",
  Thwack: "thwack",
  Whip: "whip",
  Wrath: "wrath",
};
export const DslDamageType = {
  ...baseDamageType,
} as const;
export type DslDamageType = (typeof DslDamageType)[keyof typeof DslDamageType];

export class DamageType implements IDamageType {
  public id: string;
  public name: string;
  public type: DslDamageType;
  public damageCategoryType: DslDamageCategoryType;
  public resistanceCategories: DslDamageResistanceType[];

  constructor(input: Partial<DamageType>) {
    this.id = input.id!;
    this.name = input.name!;
    this.type = input.type ?? DslDamageType.Unknown;
    this.damageCategoryType = input.damageCategoryType ?? DslDamageCategoryType.Unknown;
    this.resistanceCategories = input.resistanceCategories ?? [];
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    throw new DslError({
      message: "Don't use the default damage type",
    });
  }
}
