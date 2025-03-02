import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EmpowerWeapon implements IAbility {
  private static instance: EmpowerWeapon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
empower weapon
syntax:  cast 'empower weapon' <weapon>
One of the strongest powers given to a Paladin is the ability to infuse
a weapon with the power of divine strength. The weapon is typically infused
with power to resemble an enchanted weapon but is also blessed by the
Paladin's deity. Occasionally, the deity of the Paladin chooses to imbue the
weapon with holy power in order to help the Paladin on his divine mission to
vanquish the evil forces opposing the ethos of Goodness.
see also: PALADIN, KNIGHTHOOD`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EmpowerWeapon.instance === undefined) {
      EmpowerWeapon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EmpowerWeapon {
    if (!EmpowerWeapon.instance) {
      EmpowerWeapon.instance = new EmpowerWeapon();
    }
    return EmpowerWeapon.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EmpowerWeapon.GetInstance() as T;
  }
}

export default EmpowerWeapon;
