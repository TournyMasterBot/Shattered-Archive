import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Riding from "@shared/types/ability-types/skills/riding";
import Broadswing from "@shared/types/ability-types/skills/broadswing";
import Polearm from "@shared/types/ability-types/skills/polearm";
import UnholyRapture from "@shared/types/ability-types/skills/unholy-rapture";
import ShieldDisarm from "@shared/types/ability-types/skills/shield-disarm";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Healing from "@shared/types/ability-types/groups-spells/Healing";
import ServerCache from "@shared/cache/server-cache";
import Unholy from "@shared/types/ability-types/groups-spells/Unholy";

export class ShadowknightDefault implements IAbilityGroup {
  static instance: ShadowknightDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ShadowknightDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Healing.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Unholy.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      Riding.GetInstance(),
      Broadswing.GetInstance(),
      Polearm.GetInstance(),
      UnholyRapture.GetInstance(),
      ShieldDisarm.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowknightDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowknightDefault.GetInstance() as T;
  }
}

export default ShadowknightDefault;
