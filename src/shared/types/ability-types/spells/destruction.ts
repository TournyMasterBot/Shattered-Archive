import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Destruction implements IAbility {
  private static instance: Destruction;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Destruction.instance === undefined) {
      Destruction.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Destruction {
    if (!Destruction.instance) {
      Destruction.instance = new Destruction();
    }
    return Destruction.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Destruction.GetInstance() as T;
  }
}

export default Destruction;
