import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SummonLavalord from "@shared/types/ability-types/spells/summon-lavalord";
import SummonTreant from "@shared/types/ability-types/spells/summon-treant";
import SummonEarthlord from "@shared/types/ability-types/spells/summon-earthlord";
import SummonGryffon from "@shared/types/ability-types/spells/summon-gryffon";
import SummonWhompingWillow from "@shared/types/ability-types/spells/summon-whomping-willow";
import ServerCache from "@shared/cache/server-cache";

export class WayOfTheStars implements IAbilityGroup {
  static instance: WayOfTheStars;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WayOfTheStars;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      SummonLavalord.GetInstance(),
      SummonTreant.GetInstance(),
      SummonEarthlord.GetInstance(),
      SummonGryffon.GetInstance(),
      SummonWhompingWillow.GetInstance(),
    ];
  }

  public static GetInstance(): WayOfTheStars {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return WayOfTheStars.GetInstance() as T;
  }
}

export default WayOfTheStars;
