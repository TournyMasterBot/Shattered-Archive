import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CallWild from "@shared/types/ability-types/spells/call-wild";
import Entangle from "@shared/types/ability-types/spells/entangle";
import Swarm from "@shared/types/ability-types/spells/swarm";
import BarkSkin from "@shared/types/ability-types/spells/bark-skin";
import CreateRangerStaff from "@shared/types/ability-types/spells/create-ranger-staff";
import WrathOfNature from "@shared/types/ability-types/spells/wrath-of-nature";
import ProtectionCold from "@shared/types/ability-types/spells/protection-cold";
import NatureGrowth from "@shared/types/ability-types/spells/nature-growth";
import EnhanceSeed from "@shared/types/ability-types/spells/enhance-seed";
import ServerCache from "@shared/cache/server-cache";

export class Nature implements IAbilityGroup {
  static instance: Nature;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Nature;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CallWild.GetInstance(),
      Entangle.GetInstance(),
      Swarm.GetInstance(),
      BarkSkin.GetInstance(),
      CreateRangerStaff.GetInstance(),
      WrathOfNature.GetInstance(),
      ProtectionCold.GetInstance(),
      NatureGrowth.GetInstance(),
      EnhanceSeed.GetInstance(),
    ];
  }

  public static GetInstance(): Nature {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  public Get<T>(): T {
    return Nature.GetInstance() as T;
  }
}

export default Nature;
