import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SacredBond implements IAbility {
  private static instance: SacredBond;

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

    if (SacredBond.instance === undefined) {
      SacredBond.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SacredBond {
    if (!SacredBond.instance) {
      SacredBond.instance = new SacredBond();
    }
    return SacredBond.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SacredBond.GetInstance() as T;
  }
}

export default SacredBond;
