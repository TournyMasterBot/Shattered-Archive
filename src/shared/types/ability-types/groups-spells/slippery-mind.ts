import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import { SlipperyMind as sm } from "@shared/types/ability-types/skills/slippery-mind";

export class SlipperyMind implements IAbilityGroup {
  static instance: SlipperyMind;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.SlipperyMind;
    this.abilityGroupType = AbilityGroupType.Class;
    this.abilities = [sm.GetInstance().Get()];
  }

  public Get<T>(): T {
    if (!SlipperyMind.instance) {
      SlipperyMind.instance = new SlipperyMind();
    }
    return SlipperyMind.instance as T;
  }
}

export default SlipperyMind;
