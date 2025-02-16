import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class BugbearBite implements IAbility {
  private static instance: BugbearBite;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Bugbear Bite";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (BugbearBite.instance === undefined) {
      BugbearBite.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BugbearBite {
    if (!BugbearBite.instance) {
      BugbearBite.instance = new BugbearBite();
    }
    return BugbearBite.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BugbearBite.GetInstance() as T;
  }
}

export default BugbearBite;
