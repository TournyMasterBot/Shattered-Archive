import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Chasm from "@shared/types/ability-types/spells/chasm";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";
import Stalagmite from "@shared/types/ability-types/spells/stalagmite";
import SummonMonster from "@shared/types/ability-types/spells/summon-monster";

export class Earth implements IAbilityGroup {
  static instance: Earth;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Earth;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [Chasm.GetInstance().Get(), FlamingSoul.GetInstance().Get(), SummonMonster.GetInstance().Get(), Stalagmite.GetInstance().Get()];
  }

  Get<T>(): T {
    if (!Earth.instance) {
      Earth.instance = new Earth();
    }
    return Earth.instance as T;
  }
}

export default Earth;
