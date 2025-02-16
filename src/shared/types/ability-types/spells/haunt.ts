import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Haunt implements IAbility {
  private static instance: Haunt;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Haunt";
    this.helpFile = `
`; // Add help file content if available
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Haunt.instance === undefined) {
      Haunt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Haunt {
    if (!Haunt.instance) {
      Haunt.instance = new Haunt();
    }
    return Haunt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Haunt.GetInstance() as T;
  }
}

export default Haunt;
