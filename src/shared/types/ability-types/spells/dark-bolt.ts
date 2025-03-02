import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkBolt implements IAbility {
  private static instance: DarkBolt;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DarkBolt.instance === undefined) {
      DarkBolt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DarkBolt {
    if (!DarkBolt.instance) {
      DarkBolt.instance = new DarkBolt();
    }
    return DarkBolt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DarkBolt.GetInstance() as T;
  }
}

export default DarkBolt;
