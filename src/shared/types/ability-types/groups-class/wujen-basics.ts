import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";

export class WujenBasics implements IAbilityGroup {
  static instance: WujenBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.WujenBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WujenBasics {
    if (!WujenBasics.instance) {
      WujenBasics.instance = new WujenBasics();
    }
    return WujenBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WujenBasics.GetInstance() as T;
  }
}

export default WujenBasics;
