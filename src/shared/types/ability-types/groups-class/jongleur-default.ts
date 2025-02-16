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
import WarHymns from "../groups-songs/war-hymns";
import HymnsOfLife from "../groups-songs/hymns-of-life";

export class JongleurDefault implements IAbilityGroup {
  static instance: JongleurDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.JongleurDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...WarHymns.GetInstance().Get<WarHymns>().abilities,
      ...HymnsOfLife.GetInstance().Get<HymnsOfLife>().abilities,
      Dodge.GetInstance().Get(),
      EnhancedDamage.GetInstance().Get(),
      LightShow.GetInstance().Get(),
      Tumbling.GetInstance().Get(),
      PolevaultKick.GetInstance().Get(),
      DangerSense.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
      Parry.GetInstance().Get(),
      EntertainCrowd.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): JongleurDefault {
    if (!JongleurDefault.instance) {
      JongleurDefault.instance = new JongleurDefault();
    }
    return JongleurDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return JongleurDefault.GetInstance() as T;
  }
}

export default JongleurDefault;
