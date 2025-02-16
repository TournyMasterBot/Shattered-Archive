import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FrostShroud implements IAbility {
  private static instance: FrostShroud;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Frost Shroud";
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FrostShroud.instance === undefined) {
      FrostShroud.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FrostShroud {
    if (!FrostShroud.instance) {
      FrostShroud.instance = new FrostShroud();
    }
    return FrostShroud.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FrostShroud.GetInstance() as T;
  }
}

export default FrostShroud;
