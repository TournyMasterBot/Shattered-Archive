import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";

export class MonkDefault implements IAbilityGroup {
  static instance: MonkDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.MonkDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MonkDefault {
    if (!MonkDefault.instance) {
      MonkDefault.instance = new MonkDefault();
    }
    return MonkDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MonkDefault.GetInstance() as T;
  }
}

export default MonkDefault;
