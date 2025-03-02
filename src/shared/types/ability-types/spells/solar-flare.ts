import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SolarFlare implements IAbility {
  private static instance: SolarFlare;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SolarFlare.instance === undefined) {
      SolarFlare.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SolarFlare {
    if (!SolarFlare.instance) {
      SolarFlare.instance = new SolarFlare();
    }
    return SolarFlare.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SolarFlare.GetInstance() as T;
  }
}

export default SolarFlare;
