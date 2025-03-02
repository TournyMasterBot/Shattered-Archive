import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Bladesong from "@shared/types/ability-types/skills/Bladesong";
import Dagger from "@shared/types/ability-types/skills/Dagger";
import Sword from "@shared/types/ability-types/skills/Sword";
import ServerCache from "@shared/cache/server-cache";

export class BladesingerBasics implements IAbilityGroup {
  static instance: BladesingerBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BladesingerBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Sword.GetInstance(), 
      Dagger.GetInstance(), 
      Bladesong.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BladesingerBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BladesingerBasics.GetInstance() as T;
  }
}

export default BladesingerBasics;
