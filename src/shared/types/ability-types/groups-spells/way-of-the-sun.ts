import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Inferno from "@shared/types/ability-types/spells/inferno";
import VortexOfTheSun from "@shared/types/ability-types/spells/vortex-of-the-sun";
import FireBomb from "@shared/types/ability-types/spells/fire-bomb";
import RainOfFire from "@shared/types/ability-types/spells/rain-of-fire";
import SolarFlare from "@shared/types/ability-types/spells/solar-flare";

export class WayOfTheSun implements IAbilityGroup {
  static instance: WayOfTheSun;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.WayOfTheSun;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Inferno.GetInstance().Get(),
      VortexOfTheSun.GetInstance().Get(),
      FireBomb.GetInstance().Get(),
      RainOfFire.GetInstance().Get(),
      SolarFlare.GetInstance().Get(),
    ];
  }

  public Get<T>(): T {
    if (!WayOfTheSun.instance) {
      WayOfTheSun.instance = new WayOfTheSun();
    }
    return WayOfTheSun.instance as T;
  }
}

export default WayOfTheSun;
