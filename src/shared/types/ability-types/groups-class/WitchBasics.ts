import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/Dagger";
import Staff from "@shared/types/ability-types/skills/staff";
import ServerCache from "@shared/cache/server-cache";

export class WitchBasics implements IAbilityGroup {
  static instance: WitchBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WitchBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Dagger.GetInstance(), 
      Staff.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WitchBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WitchBasics.GetInstance() as T;
  }
}

export default WitchBasics;
