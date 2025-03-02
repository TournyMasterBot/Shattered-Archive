import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EnhancedSpear implements IAbility {
  private static instance: EnhancedSpear;

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

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help enhanced spear
Enhanced spear - Ups your Thac0, parry chance and damage percent.`;

    if (EnhancedSpear.instance === undefined) {
      EnhancedSpear.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnhancedSpear {
    if (!EnhancedSpear.instance) {
      EnhancedSpear.instance = new EnhancedSpear();
    }
    return EnhancedSpear.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnhancedSpear.GetInstance() as T;
  }
}

export default EnhancedSpear;
