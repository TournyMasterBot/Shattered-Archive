import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EngulfWind from "@shared/types/ability-types/spells/engulf-wind";
import Gust from "@shared/types/ability-types/spells/gust";
import Suffocate from "@shared/types/ability-types/spells/suffocate";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";
import ServerCache from "@shared/cache/server-cache";

export class Wind implements IAbilityGroup {
  static instance: Wind;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Wind;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      EngulfWind.GetInstance(), 
      Gust.GetInstance(), 
      Suffocate.GetInstance(), 
      FlamingSoul.GetInstance()
    ];
  }

  public static GetInstance(): Wind {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return Wind.GetInstance() as T;
  }
}

export default Wind;
