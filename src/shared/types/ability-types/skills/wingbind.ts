import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Wingbind implements IAbility {
  private static instance: Wingbind;

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
    this.name = "Wingbind";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Wingbind {
    if (!Wingbind.instance) {
      Wingbind.instance = new Wingbind();
    }
    return Wingbind.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Wingbind.GetInstance() as T;
  }
}

export default Wingbind;
