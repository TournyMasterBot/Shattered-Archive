import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RagerCharge implements IAbility {
  private static instance: RagerCharge;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (RagerCharge.instance === undefined) {
      RagerCharge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RagerCharge {
    if (!RagerCharge.instance) {
      RagerCharge.instance = new RagerCharge();
    }
    return RagerCharge.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RagerCharge.GetInstance() as T;
  }
}

export default RagerCharge;
