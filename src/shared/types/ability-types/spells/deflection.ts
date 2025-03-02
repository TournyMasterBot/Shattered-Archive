import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Deflection implements IAbility {
  private static instance: Deflection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ""; // Add help text if available
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Deflection.instance === undefined) {
      Deflection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Deflection {
    if (!Deflection.instance) {
      Deflection.instance = new Deflection();
    }
    return Deflection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Deflection.GetInstance() as T;
  }
}

export default Deflection;
