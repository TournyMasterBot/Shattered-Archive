import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EngulfWind from "@shared/types/ability-types/spells/engulf-wind";
import Gust from "@shared/types/ability-types/spells/gust";
import Suffocate from "@shared/types/ability-types/spells/suffocate";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";

export class Wind implements IAbilityGroup {
  static instance: Wind;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Wind;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      EngulfWind.GetInstance().Get(),
      Gust.GetInstance().Get(),
      Suffocate.GetInstance().Get(),
      FlamingSoul.GetInstance().Get(),
    ];
  }

  public Get<T>(): T {
    if (!Wind.instance) {
      Wind.instance = new Wind();
    }
    return Wind.instance as T;
  }
}

export default Wind;
