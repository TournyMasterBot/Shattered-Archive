import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkImmunity implements IAbility {
  private static instance: DarkImmunity;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Dark Immunity";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DarkImmunity.instance === undefined) {
      DarkImmunity.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DarkImmunity {
    if (!DarkImmunity.instance) {
      DarkImmunity.instance = new DarkImmunity();
    }
    return DarkImmunity.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DarkImmunity.GetInstance() as T;
  }
}

export default DarkImmunity;
