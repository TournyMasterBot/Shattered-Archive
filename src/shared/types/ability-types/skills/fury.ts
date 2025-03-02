import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Fury implements IAbility {
  private static instance: Fury;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "fury";
    this.helpFile = `FURY

Syntax: Fury

The Orc racial skill that is similar to berserks.`;

    if (Fury.instance === undefined) {
      Fury.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fury {
    if (!Fury.instance) {
      Fury.instance = new Fury();
    }
    return Fury.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fury.GetInstance() as T;
  }
}

export default Fury;
