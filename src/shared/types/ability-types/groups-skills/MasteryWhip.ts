import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Lash from "@shared/types/ability-types/skills/Lash";
import Yank from "@shared/types/ability-types/skills/Yank";
import Choke from "@shared/types/ability-types/skills/Choke";
import ServerCache from "@shared/cache/server-cache";

export class MasteryWhip implements IAbilityGroup {
  static instance: MasteryWhip;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MasteryWhip;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Lash.GetInstance(), 
      Yank.GetInstance(), 
      Choke.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryWhip {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryWhip.GetInstance() as T;
  }
}

export default MasteryWhip;
