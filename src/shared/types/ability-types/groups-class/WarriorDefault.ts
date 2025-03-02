import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Rescue from "@shared/types/ability-types/skills/rescue";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import Bash from "@shared/types/ability-types/skills/Bash";
import Parry from "@shared/types/ability-types/skills/parry";
import Weaponsmaster from "../groups-skills/Weaponsmaster";
import ServerCache from "@shared/cache/server-cache";

export class WarriorDefault implements IAbilityGroup {
  static instance: WarriorDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WarriorDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Weaponsmaster.GetInstance().abilities,
      ShieldBlock.GetInstance(),
      Disarm.GetInstance(),
      Rescue.GetInstance(),
      EnhancedDamage.GetInstance(),
      ThirdAttack.GetInstance(),
      Bash.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarriorDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarriorDefault.GetInstance() as T;
  }
}

export default WarriorDefault;
