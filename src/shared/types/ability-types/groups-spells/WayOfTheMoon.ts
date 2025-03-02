import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import MoonGaze from "@shared/types/ability-types/spells/moon-gaze";
import MoonPull from "@shared/types/ability-types/spells/moon-pull";
import EclipseBeing from "@shared/types/ability-types/spells/eclipse-being";
import MoonShadow from "@shared/types/ability-types/spells/moon-shadow";
import MindCrater from "@shared/types/ability-types/spells/mind-crater";
import ServerCache from "@shared/cache/server-cache";

export class WayOfTheMoon implements IAbilityGroup {
  static instance: WayOfTheMoon;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WayOfTheMoon;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      MoonGaze.GetInstance(),
      MoonPull.GetInstance(),
      EclipseBeing.GetInstance(),
      MoonShadow.GetInstance(),
      MindCrater.GetInstance(),
    ];
  }

  public static GetInstance(): WayOfTheMoon {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return WayOfTheMoon.GetInstance() as T;
  }
}

export default WayOfTheMoon;
