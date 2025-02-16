import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Furnace implements IAbility {
  private static instance: Furnace;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Furnace";
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Furnace.instance === undefined) {
      Furnace.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Furnace {
    if (!Furnace.instance) {
      Furnace.instance = new Furnace();
    }
    return Furnace.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Furnace.GetInstance() as T;
  }
}

export default Furnace;
