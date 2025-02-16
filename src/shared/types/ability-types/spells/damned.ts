import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Damned implements IAbility {
  private static instance: Damned;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Damned";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Damned.instance === undefined) {
      Damned.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Damned {
    if (!Damned.instance) {
      Damned.instance = new Damned();
    }
    return Damned.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Damned.GetInstance() as T;
  }
}

export default Damned;
