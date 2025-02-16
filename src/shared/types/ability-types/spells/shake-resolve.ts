import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShakeResolve implements IAbility {
  private static instance: ShakeResolve;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shake Resolve";
    this.helpFile = ""; // Empty help file
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShakeResolve.instance === undefined) {
      ShakeResolve.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShakeResolve {
    if (!ShakeResolve.instance) {
      ShakeResolve.instance = new ShakeResolve();
    }
    return ShakeResolve.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShakeResolve.GetInstance() as T;
  }
}

export default ShakeResolve;
