import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import MetalStorm from "@shared/types/ability-types/spells/MetalStorm";
import ForceField from "@shared/types/ability-types/spells/ForceField";
import ControlMetal from "@shared/types/ability-types/spells/ControlMetal";
import FlamingSoul from "@shared/types/ability-types/spells/FlamingSoul";
import ServerCache from "@shared/cache/server-cache";

export class Metal implements IAbilityGroup {
  static instance: Metal;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Metal;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      MetalStorm.GetInstance(),
      ForceField.GetInstance(),
      ControlMetal.GetInstance(),
      FlamingSoul.GetInstance(),
    ];
  }

  public static GetInstance(): Metal {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return Metal.GetInstance() as T;
  }
}

export default Metal;
