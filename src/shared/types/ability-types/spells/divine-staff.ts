import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DivineStaff implements IAbility {
  private static instance: DivineStaff;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Divine Staff";
    this.helpFile = `
help 'Divine Staff'
'DIVINE STAFF'
Syntax: cast 'divine staff'

This spell summons a powerful divine staff, enhancing the caster's magical abilities and granting bonuses to spellcasting.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DivineStaff.instance === undefined) {
      DivineStaff.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DivineStaff {
    if (!DivineStaff.instance) {
      DivineStaff.instance = new DivineStaff();
    }
    return DivineStaff.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DivineStaff.GetInstance() as T;
  }
}

export default DivineStaff;
