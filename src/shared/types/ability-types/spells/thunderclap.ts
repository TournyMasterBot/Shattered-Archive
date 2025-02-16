import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Thunderclap implements IAbility {
  private static instance: Thunderclap;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Thunderclap";
    this.helpFile = `thunderclap
Syntax: c thunderclap
By communing with the storm spirits, an experienced shaman can cause
a devastatingly loud thunderclap which damages all within a room with
an earsplitting boom.
`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Thunderclap.instance === undefined) {
      Thunderclap.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Thunderclap {
    if (!Thunderclap.instance) {
      Thunderclap.instance = new Thunderclap();
    }
    return Thunderclap.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Thunderclap.GetInstance() as T;
  }
}

export default Thunderclap;
