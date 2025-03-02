import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShrinkSkull implements IAbility {
  private static instance: ShrinkSkull;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShrinkSkull.instance === undefined) {
      ShrinkSkull.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShrinkSkull {
    if (!ShrinkSkull.instance) {
      ShrinkSkull.instance = new ShrinkSkull();
    }
    return ShrinkSkull.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShrinkSkull.GetInstance() as T;
  }
}

export default ShrinkSkull;
