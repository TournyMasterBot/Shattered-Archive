import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Sharpen implements IAbility {
  private static instance: Sharpen;

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
    this.name = "Sharpen";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;
    this.manualDescription = ``;

    if (Sharpen.instance === undefined) {
      Sharpen.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sharpen {
    if (!Sharpen.instance) {
      Sharpen.instance = new Sharpen();
    }
    return Sharpen.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sharpen.GetInstance() as T;
  }
}

export default Sharpen;
