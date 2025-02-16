import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonFelbeast implements IAbility {
  private static instance: SummonFelbeast;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Summon Felbeast";
    this.helpFile = ``;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonFelbeast.instance === undefined) {
      SummonFelbeast.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonFelbeast {
    if (!SummonFelbeast.instance) {
      SummonFelbeast.instance = new SummonFelbeast();
    }
    return SummonFelbeast.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonFelbeast.GetInstance() as T;
  }
}

export default SummonFelbeast;
