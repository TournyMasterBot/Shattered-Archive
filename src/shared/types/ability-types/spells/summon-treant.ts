import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonTreant implements IAbility {
  private static instance: SummonTreant;

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

    if (SummonTreant.instance === undefined) {
      SummonTreant.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonTreant {
    if (!SummonTreant.instance) {
      SummonTreant.instance = new SummonTreant();
    }
    return SummonTreant.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonTreant.GetInstance() as T;
  }
}

export default SummonTreant;
