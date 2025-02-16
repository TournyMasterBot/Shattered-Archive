import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Monsoon implements IAbility {
  private static instance: Monsoon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Monsoon";
    this.helpFile = `
help wujen
Monsoon - The Wu Jen summons a localized tempest that hammers rain down upon
their enemies, dealing damage to everyone that is not grouped with them.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Monsoon.instance === undefined) {
      Monsoon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Monsoon {
    if (!Monsoon.instance) {
      Monsoon.instance = new Monsoon();
    }
    return Monsoon.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Monsoon.GetInstance() as T;
  }
}

export default Monsoon;
