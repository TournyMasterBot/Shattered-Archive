import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnhanceSeed implements IAbility {
  private static instance: EnhanceSeed;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Enhance Seed";
    this.helpFile = `
help 'Enhance Seed'
enhance seed
syntax: c 'enhance seed' <object>

This spell will enhance the growing capability of a seed.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnhanceSeed.instance === undefined) {
      EnhanceSeed.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnhanceSeed {
    if (!EnhanceSeed.instance) {
      EnhanceSeed.instance = new EnhanceSeed();
    }
    return EnhanceSeed.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnhanceSeed.GetInstance() as T;
  }
}

export default EnhanceSeed;
