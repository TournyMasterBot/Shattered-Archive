import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/Dagger";
import ServerCache from "@shared/cache/server-cache";

export class WujenBasics implements IAbilityGroup {
  static instance: WujenBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WujenBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Dagger.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WujenBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WujenBasics.GetInstance() as T;
  }
}

export default WujenBasics;
