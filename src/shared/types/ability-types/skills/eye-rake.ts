import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EyeRake implements IAbility {
  private static instance: EyeRake;

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
    this.name = "Eye Rake";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help eye rake
EYE RAKE
An aggressive skill used to inflict pain and disorient an opponent.`;

    this.manualDescription = "Eye Rake is the Bard bounty skill";

    if (EyeRake.instance === undefined) {
      EyeRake.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EyeRake {
    if (!EyeRake.instance) {
      EyeRake.instance = new EyeRake();
    }
    return EyeRake.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EyeRake.GetInstance() as T;
  }
}

export default EyeRake;
