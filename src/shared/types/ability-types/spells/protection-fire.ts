import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ProtectionFire implements IAbility {
  private static instance: ProtectionFire;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Protection Fire'
'PROTECTION COLD' 'PROTECTION FIRE'
'PROTECTION COLD' 'PROTECTION FIRE'

Syntax: cast 'protection cold'
        cast 'protection fire'

These protection spells call forth powerful defensive magics to shield the
wielder from attacks of either cold or flame respectively. The protection
spells reduce the damage taken from said attacks.

See also - NATURE
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ProtectionFire.instance === undefined) {
      ProtectionFire.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ProtectionFire {
    if (!ProtectionFire.instance) {
      ProtectionFire.instance = new ProtectionFire();
    }
    return ProtectionFire.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ProtectionFire.GetInstance() as T;
  }
}

export default ProtectionFire;
