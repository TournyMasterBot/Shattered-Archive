import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fortitude implements IAbility {
  private static instance: Fortitude;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Fortitude";
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Fortitude.instance === undefined) {
      Fortitude.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fortitude {
    if (!Fortitude.instance) {
      Fortitude.instance = new Fortitude();
    }
    return Fortitude.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fortitude.GetInstance() as T;
  }
}

export default Fortitude;
