import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EnchantArmor from "@shared/types/ability-types/spells/enchant-armor";
import Recharge from "@shared/types/ability-types/spells/recharge";
import EnchantWeapon from "@shared/types/ability-types/spells/enchant-weapon";
import Fireproof from "@shared/types/ability-types/spells/fireproof";

export class Enchantment implements IAbilityGroup {
  static instance: Enchantment;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Enchantment;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      EnchantArmor.GetInstance().Get(),
      Recharge.GetInstance().Get(),
      EnchantWeapon.GetInstance().Get(),
      Fireproof.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Enchantment {
    if (!Enchantment.instance) {
      Enchantment.instance = new Enchantment();
    }
    return Enchantment.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Enchantment.GetInstance() as T;
  }
}

export default Enchantment;
