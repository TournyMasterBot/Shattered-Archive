import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SummonLavalord from "@shared/types/ability-types/spells/summon-lavalord";
import SummonTreant from "@shared/types/ability-types/spells/summon-treant";
import SummonEarthlord from "@shared/types/ability-types/spells/summon-earthlord";
import SummonGryffon from "@shared/types/ability-types/spells/summon-gryffon";
import SummonWhompingWillow from "@shared/types/ability-types/spells/summon-whomping-willow";

export class WayOfTheStars implements IAbilityGroup {
  static instance: WayOfTheStars;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.WayOfTheStars;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      SummonLavalord.GetInstance().Get(),
      SummonTreant.GetInstance().Get(),
      SummonEarthlord.GetInstance().Get(),
      SummonGryffon.GetInstance().Get(),
      SummonWhompingWillow.GetInstance().Get(),
    ];
  }

  public Get<T>(): T {
    if (!WayOfTheStars.instance) {
      WayOfTheStars.instance = new WayOfTheStars();
    }
    return WayOfTheStars.instance as T;
  }
}

export default WayOfTheStars;
