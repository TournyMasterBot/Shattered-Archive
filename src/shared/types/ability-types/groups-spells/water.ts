import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Wave from "@shared/types/ability-types/spells/wave";
import Monsoon from "@shared/types/ability-types/spells/monsoon";
import Drown from "@shared/types/ability-types/spells/drown";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";

export class Water implements IAbilityGroup {
  static instance: Water;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Water;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Wave.GetInstance().Get(),
      Monsoon.GetInstance().Get(),
      Drown.GetInstance().Get(),
      FlamingSoul.GetInstance().Get(),
    ];
  }

  public Get<T>(): T {
    if (!Water.instance) {
      Water.instance = new Water();
    }
    return Water.instance as T;
  }
}

export default Water;
