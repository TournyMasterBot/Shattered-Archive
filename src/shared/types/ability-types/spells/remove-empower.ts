import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RemoveEmpower implements IAbility {
  private static instance: RemoveEmpower;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
remove empower
Syntax: c 'remove empower' <weapon>

This spell of the holy spell group allows paladins to remove holy
empowerments upon weapons.
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RemoveEmpower.instance === undefined) {
      RemoveEmpower.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RemoveEmpower {
    if (!RemoveEmpower.instance) {
      RemoveEmpower.instance = new RemoveEmpower();
    }
    return RemoveEmpower.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RemoveEmpower.GetInstance() as T;
  }
}

export default RemoveEmpower;
