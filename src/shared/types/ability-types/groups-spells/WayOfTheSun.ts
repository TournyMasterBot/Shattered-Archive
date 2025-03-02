import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Inferno from "@shared/types/ability-types/spells/Inferno";
import VortexOfTheSun from "@shared/types/ability-types/spells/VortexOfTheSun";
import FireBomb from "@shared/types/ability-types/spells/FireBomb";
import RainOfFire from "@shared/types/ability-types/spells/RainOfFire";
import SolarFlare from "@shared/types/ability-types/spells/SolarFlare";
import ServerCache from "@shared/cache/server-cache";

export class WayOfTheSun implements IAbilityGroup {
  static instance: WayOfTheSun;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WayOfTheSun;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Inferno.GetInstance(),
      VortexOfTheSun.GetInstance(),
      FireBomb.GetInstance(),
      RainOfFire.GetInstance(),
      SolarFlare.GetInstance(),
    ];
  }

  public static GetInstance(): WayOfTheSun {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return WayOfTheSun.GetInstance() as T;
  }
}

export default WayOfTheSun;
