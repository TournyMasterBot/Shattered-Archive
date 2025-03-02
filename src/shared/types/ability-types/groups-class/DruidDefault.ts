import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Attack from "@shared/types/ability-types/groups-spells/Attack";
import Healing from "@shared/types/ability-types/groups-spells/Healing";
import Protective from "@shared/types/ability-types/groups-spells/Protective";
import Weather from "@shared/types/ability-types/groups-spells/Weather";
import AcuteVision from "@shared/types/ability-types/skills/AcuteVision";
import Creaturelore from "@shared/types/ability-types/skills/Creaturelore";
import DarkVision from "@shared/types/ability-types/skills/DarkVision";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import FindWater from "@shared/types/ability-types/skills/FindWater";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Tame from "@shared/types/ability-types/skills/Tame";
import ServerCache from "@shared/cache/server-cache";
import Nature from "@shared/types/ability-types/groups-spells/Nature";

export class DruidDefault implements IAbilityGroup {
  private static instance: DruidDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.DruidDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Nature.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Attack.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      FindWater.GetInstance(),
      Sneak.GetInstance(),
      Dodge.GetInstance(),
      DarkVision.GetInstance(),
      Tame.GetInstance(),
      AcuteVision.GetInstance(),
      Creaturelore.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): DruidDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DruidDefault.GetInstance() as T;
  }
}

export default DruidDefault;
