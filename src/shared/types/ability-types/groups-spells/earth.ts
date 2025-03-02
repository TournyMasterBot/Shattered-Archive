import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Chasm from "@shared/types/ability-types/spells/Chasm";
import FlamingSoul from "@shared/types/ability-types/spells/FlamingSoul";
import Stalagmite from "@shared/types/ability-types/spells/Stalagmite";
import SummonMonster from "@shared/types/ability-types/spells/SummonMonster";
import ServerCache from "@shared/cache/server-cache";

export class Earth implements IAbilityGroup {
  static instance: Earth;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Earth;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Chasm.GetInstance(), 
      FlamingSoul.GetInstance(), 
      SummonMonster.GetInstance(), 
      Stalagmite.GetInstance()
    ];
  }

  public static GetInstance(): Earth {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  Get<T>(): T {
    return Earth.GetInstance() as T;
  }
}

export default Earth;
