import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Wingstall implements IAbility {
  private static instance: Wingstall;

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
    this.helpFile = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Wingstall {
    if (!Wingstall.instance) {
      Wingstall.instance = new Wingstall();
    }
    return Wingstall.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Wingstall.GetInstance() as T;
  }
}

export default Wingstall;
