import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fasting implements IAbility {
  private static instance: Fasting;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Fasting";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Fasting.instance === undefined) {
      Fasting.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fasting {
    if (!Fasting.instance) {
      Fasting.instance = new Fasting();
    }
    return Fasting.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fasting.GetInstance() as T;
  }
}

export default Fasting;
