import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonLavalord implements IAbility {
  private static instance: SummonLavalord;

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

    if (SummonLavalord.instance === undefined) {
      SummonLavalord.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonLavalord {
    if (!SummonLavalord.instance) {
      SummonLavalord.instance = new SummonLavalord();
    }
    return SummonLavalord.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonLavalord.GetInstance() as T;
  }
}

export default SummonLavalord;
