import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectVampire implements IAbility {
  private static instance: DetectVampire;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ""; // Add help text here
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DetectVampire.instance === undefined) {
      DetectVampire.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DetectVampire {
    if (!DetectVampire.instance) {
      DetectVampire.instance = new DetectVampire();
    }
    return DetectVampire.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DetectVampire.GetInstance() as T;
  }
}

export default DetectVampire;
