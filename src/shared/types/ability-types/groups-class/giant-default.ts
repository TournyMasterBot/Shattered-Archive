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

  constructor() {
    this.abilityGroup = AbilityGroup.GiantDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Bash.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
      EnhancedDamage.GetInstance().Get(),
      Riding.GetInstance().Get(),
      Kick.GetInstance().Get(),
      Dodge.GetInstance().Get(),
      Haggle.GetInstance().Get(),
      DirtKicking.GetInstance().Get(),
      Disarm.GetInstance().Get(),
      Rescue.GetInstance().Get(),
      HandToHand.GetInstance().Get(),
      Sneak.GetInstance().Get(),
      BlindFighting.GetInstance().Get(),
      Trip.GetInstance().Get(),
      ThirdAttack.GetInstance().Get(),
      ShieldBlock.GetInstance().Get(),
      Parry.GetInstance().Get(),
      FastHealing.GetInstance().Get(),
      Hide.GetInstance().Get(),
      Peek.GetInstance().Get(),
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
