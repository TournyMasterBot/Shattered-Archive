import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import LightShow from "@shared/types/ability-types/skills/light-show";
import Tumbling from "@shared/types/ability-types/skills/tumbling";
import PolevaultKick from "@shared/types/ability-types/skills/polevault-kick";
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Parry from "@shared/types/ability-types/skills/parry";
import EntertainCrowd from "@shared/types/ability-types/skills/entertain-crowd";
import WarHymns from "../groups-songs/WarHymns";
import HymnsOfLife from "../groups-songs/HymnsOfLife";
import ServerCache from "@shared/cache/server-cache";

export class JongleurDefault implements IAbilityGroup {
  static instance: JongleurDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.JongleurDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...WarHymns.GetInstance().abilities,
      ...HymnsOfLife.GetInstance().abilities,
      Dodge.GetInstance(),
      EnhancedDamage.GetInstance(),
      LightShow.GetInstance(),
      Tumbling.GetInstance(),
      PolevaultKick.GetInstance(),
      DangerSense.GetInstance(),
      SecondAttack.GetInstance(),
      Parry.GetInstance(),
      EntertainCrowd.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): JongleurDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return JongleurDefault.GetInstance() as T;
  }
}

export default JongleurDefault;
