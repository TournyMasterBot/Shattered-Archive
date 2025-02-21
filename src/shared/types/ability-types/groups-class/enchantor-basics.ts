import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";

export class EnchantorBasics implements IAbilityGroup {
  static instance: EnchantorBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;
  
  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.EnchantorBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnchantorBasics {
    if (!EnchantorBasics.instance) {
      EnchantorBasics.instance = new EnchantorBasics();
    }
    return EnchantorBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnchantorBasics.GetInstance() as T;
  }
}

export default EnchantorBasics;
