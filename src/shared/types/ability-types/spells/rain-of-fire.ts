import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RainOfFire implements IAbility {
  private static instance: RainOfFire;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Rain of Fire";
    this.helpFile = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RainOfFire.instance === undefined) {
      RainOfFire.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RainOfFire {
    if (!RainOfFire.instance) {
      RainOfFire.instance = new RainOfFire();
    }
    return RainOfFire.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RainOfFire.GetInstance() as T;
  }
}

export default RainOfFire;
