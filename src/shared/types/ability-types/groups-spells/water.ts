import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Wave from "@shared/types/ability-types/spells/Wave";
import Monsoon from "@shared/types/ability-types/spells/Monsoon";
import Drown from "@shared/types/ability-types/spells/Drown";
import FlamingSoul from "@shared/types/ability-types/spells/FlamingSoul";
import ServerCache from "@shared/cache/server-cache";

export class Water implements IAbilityGroup {
  static instance: Water;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Water;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Wave.GetInstance(), 
      Monsoon.GetInstance(), 
      Drown.GetInstance(), 
      FlamingSoul.GetInstance()
    ];
  }

  public static GetInstance(): Water {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return Water.GetInstance() as T;
  }
}

export default Water;
