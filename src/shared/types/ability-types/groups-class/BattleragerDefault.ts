import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Detection from "../groups-spells/Detection";
import Bash from "@shared/types/ability-types/skills/Bash";
import Dagger from "@shared/types/ability-types/skills/Dagger";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Headbutt from "@shared/types/ability-types/skills/headbutt";
import Parry from "@shared/types/ability-types/skills/parry";
import Possession from "@shared/types/ability-types/skills/possession";
import RagerCharge from "@shared/types/ability-types/skills/rager-charge";
import Rescue from "@shared/types/ability-types/skills/rescue";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import ShieldKick from "@shared/types/ability-types/skills/shield-kick";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import ServerCache from "@shared/cache/server-cache";

export class BattleragerDefault implements IAbilityGroup {
  static instance: BattleragerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BattleragerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().abilities,
       SecondAttack.GetInstance(),
       Disarm.GetInstance(),
       Dagger.GetInstance(),
       Headbutt.GetInstance(),
       Possession.GetInstance(),
       ThirdAttack.GetInstance(),
       ShieldBlock.GetInstance(),
       Rescue.GetInstance(),
       ShieldKick.GetInstance(),
       Bash.GetInstance(),
       Parry.GetInstance(),
       EnhancedDamage.GetInstance(),
       RagerCharge.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BattleragerDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BattleragerDefault.GetInstance() as T;
  }
}

export default BattleragerDefault;
