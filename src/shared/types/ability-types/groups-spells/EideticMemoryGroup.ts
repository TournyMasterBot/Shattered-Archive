import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EideticMemory from "@shared/types/ability-types/skills/eidetic-memory";
import ServerCache from "@shared/cache/server-cache";

export class EideticMemoryGroup implements IAbilityGroup {
  static instance: EideticMemoryGroup;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.EideticMemory;
    this.abilityGroupType = AbilityGroupType.Class;
    this.abilities = [
      EideticMemory.GetInstance()
    ];
  }

  public static GetInstance(): EideticMemoryGroup {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  Get<T>(): T {
    return EideticMemory.GetInstance() as T;
  }
}

export default EideticMemoryGroup;
