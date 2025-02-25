import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Bash from "@shared/types/ability-types/skills/bash";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Riding from "@shared/types/ability-types/skills/riding";
import Kick from "@shared/types/ability-types/skills/kick";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Haggle from "@shared/types/ability-types/skills/haggle";
import DirtKicking from "@shared/types/ability-types/skills/dirt-kicking";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Rescue from "@shared/types/ability-types/skills/rescue";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Sneak from "@shared/types/ability-types/skills/sneak";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import Trip from "@shared/types/ability-types/skills/trip";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Parry from "@shared/types/ability-types/skills/parry";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Hide from "@shared/types/ability-types/skills/hide";
import Peek from "@shared/types/ability-types/skills/peek";

export class GiantDefault implements IAbilityGroup {
  static instance: GiantDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
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
    if (!GiantDefault.instance) {
      GiantDefault.instance = new GiantDefault();
    }
    return GiantDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantDefault.GetInstance() as T;
  }
}

export default GiantDefault;
