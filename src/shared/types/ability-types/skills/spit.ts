import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Spit implements IAbility {
  private static instance: Spit;

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
    this.name = "Spit";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;
    this.manualDescription = "Spit in your opponents eyes, blinding them";

    if (Spit.instance === undefined) {
      Spit.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Spit {
    if (!Spit.instance) {
      Spit.instance = new Spit();
    }
    return Spit.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Spit.GetInstance() as T;
  }
}

export default Spit;
