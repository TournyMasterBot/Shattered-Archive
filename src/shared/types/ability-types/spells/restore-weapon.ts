import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RestoreWeapon implements IAbility {
  private static instance: RestoreWeapon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Restore Weapon";
    this.helpFile = `
RESTORE WEAPON

Syntax: cast 'restore weapon' <object>

The restore weapon spell allows the enchantor to return a weapon to its
original state. The only requirement to restore an item is that its
current state has had an enchantment placed on it. It has been rumoured that
attempting to restore a weapon does not always work out as expected, so at
times, enchantors may wish to be wary.
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RestoreWeapon.instance === undefined) {
      RestoreWeapon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RestoreWeapon {
    if (!RestoreWeapon.instance) {
      RestoreWeapon.instance = new RestoreWeapon();
    }
    return RestoreWeapon.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RestoreWeapon.GetInstance() as T;
  }
}

export default RestoreWeapon;
