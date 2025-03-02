import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonWhompingWillow implements IAbility {
  private static instance: SummonWhompingWillow;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ``;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonWhompingWillow.instance === undefined) {
      SummonWhompingWillow.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonWhompingWillow {
    if (!SummonWhompingWillow.instance) {
      SummonWhompingWillow.instance = new SummonWhompingWillow();
    }
    return SummonWhompingWillow.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonWhompingWillow.GetInstance() as T;
  }
}

export default SummonWhompingWillow;
