import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";

export class MonkBasics implements IAbilityGroup {
  static instance: MonkBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.MonkBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MonkBasics {
    if (!MonkBasics.instance) {
      MonkBasics.instance = new MonkBasics();
    }
    return MonkBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MonkBasics.GetInstance() as T;
  }
}

export default MonkBasics;
