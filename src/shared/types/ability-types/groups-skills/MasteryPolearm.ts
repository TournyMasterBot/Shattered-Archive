import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Distance from "@shared/types/ability-types/skills/distance";
import Entrap from "@shared/types/ability-types/skills/entrap";
import Chargeset from "@shared/types/ability-types/skills/Chargeset";
import ServerCache from "@shared/cache/server-cache";

export class MasteryPolearm implements IAbilityGroup {
  static instance: MasteryPolearm;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MasteryPolearm;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Distance.GetInstance(), 
      Entrap.GetInstance(), 
      Chargeset.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryPolearm {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryPolearm.GetInstance() as T;
  }
}

export default MasteryPolearm;
