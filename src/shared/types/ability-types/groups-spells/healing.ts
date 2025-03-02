import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CureCritical from "@shared/types/ability-types/spells/CureCritical";
import Heal from "@shared/types/ability-types/spells/Heal";
import CureLight from "@shared/types/ability-types/spells/CureLight";
import MassHealing from "@shared/types/ability-types/spells/MassHealing";
import CureSerious from "@shared/types/ability-types/spells/CureSerious";
import Refresh from "@shared/types/ability-types/spells/Refresh";
import ServerCache from "@shared/cache/server-cache";

export class Healing implements IAbilityGroup {
  static instance: Healing;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Healing;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CureCritical.GetInstance(),
      Heal.GetInstance(),
      CureLight.GetInstance(),
      MassHealing.GetInstance(),
      CureSerious.GetInstance(),
      Refresh.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Healing {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Healing.GetInstance() as T;
  }
}

export default Healing;
