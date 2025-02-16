import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ViperBite implements IAbility {
  private static instance: ViperBite;

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
    this.name = "Viper Bite";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = "";
    this.manualDescription = "Bite an opponent, paralyzing them";
  }

  // Method to get the single instance of the class
  public static GetInstance(): ViperBite {
    if (!ViperBite.instance) {
      ViperBite.instance = new ViperBite();
    }
    return ViperBite.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ViperBite.GetInstance() as T;
  }
}

export default ViperBite;
