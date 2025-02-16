import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Runestaff implements IAbility {
  private static instance: Runestaff;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Runestaff";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Runestaff.instance === undefined) {
      Runestaff.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Runestaff {
    if (!Runestaff.instance) {
      Runestaff.instance = new Runestaff();
    }
    return Runestaff.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Runestaff.GetInstance() as T;
  }
}

export default Runestaff;
