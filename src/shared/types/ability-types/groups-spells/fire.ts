import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import FlameWall from "@shared/types/ability-types/spells/flame-wall";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";
import Ignite from "@shared/types/ability-types/spells/ignite";
import ScorchingWinds from "@shared/types/ability-types/spells/scorching-winds";
import ServerCache from "@shared/cache/server-cache";

export class Fire implements IAbilityGroup {
  static instance: Fire;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Fire;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      FlameWall.GetInstance(), 
      FlamingSoul.GetInstance(), 
      Ignite.GetInstance(), 
      ScorchingWinds.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fire {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fire.GetInstance() as T;
  }
}

export default Fire;
