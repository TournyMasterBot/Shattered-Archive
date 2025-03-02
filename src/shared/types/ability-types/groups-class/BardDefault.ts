import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Pugil from "@shared/types/ability-types/skills/pugil";
import Roundhouse from "@shared/types/ability-types/skills/roundhouse";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Parry from "@shared/types/ability-types/skills/parry";
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import WarHymns from "../groups-songs/WarHymns";
import HymnsOfLife from "../groups-songs/HymnsOfLife";
import ServerCache from "@shared/cache/server-cache";

export class BardDefault implements IAbilityGroup {
  static instance: BardDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BardDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...WarHymns.GetInstance().abilities,
      ...HymnsOfLife.GetInstance().abilities,
       Dodge.GetInstance(),
       Pugil.GetInstance(),
       Roundhouse.GetInstance(),
       EnhancedDamage.GetInstance(),
       SecondAttack.GetInstance(),
       Parry.GetInstance(),
       DangerSense.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BardDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BardDefault.GetInstance() as T;
  }
}

export default BardDefault;
