import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class QuickLoad implements IAbility {
  private static instance: QuickLoad;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Quick Load";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (QuickLoad.instance === undefined) {
      QuickLoad.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): QuickLoad {
    if (!QuickLoad.instance) {
      QuickLoad.instance = new QuickLoad();
    }
    return QuickLoad.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return QuickLoad.GetInstance() as T;
  }
}

export default QuickLoad;
