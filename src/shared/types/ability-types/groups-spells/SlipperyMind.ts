import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import { SlipperyMind as sm } from "@shared/types/ability-types/skills/slippery-mind";
import ServerCache from "@shared/cache/server-cache";

export class SlipperyMind implements IAbilityGroup {
  static instance: SlipperyMind;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.SlipperyMind;
    this.abilityGroupType = AbilityGroupType.Class;
    this.abilities = [sm.GetInstance()];
  }

  public static GetInstance(): SlipperyMind {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return SlipperyMind.GetInstance() as T;
  }
}

export default SlipperyMind;
