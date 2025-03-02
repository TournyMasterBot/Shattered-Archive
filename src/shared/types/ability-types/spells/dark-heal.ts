import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkHeal implements IAbility {
  private static instance: DarkHeal;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DarkHeal.instance === undefined) {
      DarkHeal.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DarkHeal {
    if (!DarkHeal.instance) {
      DarkHeal.instance = new DarkHeal();
    }
    return DarkHeal.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DarkHeal.GetInstance() as T;
  }
}

export default DarkHeal;
