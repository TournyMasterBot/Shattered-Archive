import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelEvil implements IAbility {
  private static instance: DispelEvil;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Dispel Evil";
    this.helpFile = `
help 'Dispel Evil'
'DISPEL EVIL'
DISPEL EVIL

Syntax: cast 'dispel evil' <victim>

This spell invokes the wrath of the Gods on an evil victim.  It can be very
dangerous for casters who are not pure of heart.

See also - ATTACK
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DispelEvil.instance === undefined) {
      DispelEvil.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DispelEvil {
    if (!DispelEvil.instance) {
      DispelEvil.instance = new DispelEvil();
    }
    return DispelEvil.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DispelEvil.GetInstance() as T;
  }
}

export default DispelEvil;
