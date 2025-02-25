import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import MoonGaze from "@shared/types/ability-types/spells/moon-gaze";
import MoonPull from "@shared/types/ability-types/spells/moon-pull";
import EclipseBeing from "@shared/types/ability-types/spells/eclipse-being";
import MoonShadow from "@shared/types/ability-types/spells/moon-shadow";
import MindCrater from "@shared/types/ability-types/spells/mind-crater";

export class WayOfTheMoon implements IAbilityGroup {
  static instance: WayOfTheMoon;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
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

  public Get<T>(): T {
    if (!WayOfTheMoon.instance) {
      WayOfTheMoon.instance = new WayOfTheMoon();
    }
    return WayOfTheMoon.instance as T;
  }
}

export default WayOfTheMoon;
