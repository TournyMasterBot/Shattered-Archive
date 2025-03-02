import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RemoveTrap implements IAbility {
  private static instance: RemoveTrap;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (RemoveTrap.instance === undefined) {
      RemoveTrap.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RemoveTrap {
    if (!RemoveTrap.instance) {
      RemoveTrap.instance = new RemoveTrap();
    }
    return RemoveTrap.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RemoveTrap.GetInstance() as T;
  }
}

export default RemoveTrap;
