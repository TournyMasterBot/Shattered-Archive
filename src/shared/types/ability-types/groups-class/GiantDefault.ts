import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Bash from "@shared/types/ability-types/skills/Bash";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import EnhancedDamage from "@shared/types/ability-types/skills/EnhancedDamage";
import Riding from "@shared/types/ability-types/skills/Riding";
import Kick from "@shared/types/ability-types/skills/Kick";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import Haggle from "@shared/types/ability-types/skills/Haggle";
import DirtKicking from "@shared/types/ability-types/skills/DirtKicking";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import Rescue from "@shared/types/ability-types/skills/Rescue";
import HandToHand from "@shared/types/ability-types/skills/HandToHand";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import BlindFighting from "@shared/types/ability-types/skills/BlindFighting";
import Trip from "@shared/types/ability-types/skills/Trip";
import ThirdAttack from "@shared/types/ability-types/skills/ThirdAttack";
import ShieldBlock from "@shared/types/ability-types/skills/ShieldBlock";
import Parry from "@shared/types/ability-types/skills/Parry";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import Hide from "@shared/types/ability-types/skills/Hide";
import Peek from "@shared/types/ability-types/skills/Peek";
import ServerCache from "@shared/cache/server-cache";

export class GiantDefault implements IAbilityGroup {
  static instance: GiantDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.GiantDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Bash.GetInstance(),
      SecondAttack.GetInstance(),
      EnhancedDamage.GetInstance(),
      Riding.GetInstance(),
      Kick.GetInstance(),
      Dodge.GetInstance(),
      Haggle.GetInstance(),
      DirtKicking.GetInstance(),
      Disarm.GetInstance(),
      Rescue.GetInstance(),
      HandToHand.GetInstance(),
      Sneak.GetInstance(),
      BlindFighting.GetInstance(),
      Trip.GetInstance(),
      ThirdAttack.GetInstance(),
      ShieldBlock.GetInstance(),
      Parry.GetInstance(),
      FastHealing.GetInstance(),
      Hide.GetInstance(),
      Peek.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantDefault.GetInstance() as T;
  }
}

export default GiantDefault;
