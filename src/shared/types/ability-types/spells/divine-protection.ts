import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DivineProtection implements IAbility {
  private static instance: DivineProtection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Divine Protection'
'DIVINE PROTECTION'
Syntax: cast 'divine protection'

This spell grants the target a protective aura, enhancing their defenses against magical and physical attacks.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DivineProtection.instance === undefined) {
      DivineProtection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DivineProtection {
    if (!DivineProtection.instance) {
      DivineProtection.instance = new DivineProtection();
    }
    return DivineProtection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DivineProtection.GetInstance() as T;
  }
}

export default DivineProtection;
