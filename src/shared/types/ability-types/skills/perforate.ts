import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Perforate implements IAbility {
  private static instance: Perforate;

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
    this.helpFile = ``;

    this.manualDescription = "Perforate is the Thief bounty skill";

    if (Perforate.instance === undefined) {
      Perforate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Perforate {
    if (!Perforate.instance) {
      Perforate.instance = new Perforate();
    }
    return Perforate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Perforate.GetInstance() as T;
  }
}

export default Perforate;
