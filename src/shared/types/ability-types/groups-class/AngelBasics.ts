import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import BlindFighting from "@shared/types/ability-types/skills/BlindFighting";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import EnhancedDamage from "@shared/types/ability-types/skills/EnhancedDamage";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import Flail from "@shared/types/ability-types/skills/Flail";
import Meditation from "@shared/types/ability-types/skills/Meditation";
import Parry from "@shared/types/ability-types/skills/Parry";
import Rescue from "@shared/types/ability-types/skills/Rescue";
import Riding from "@shared/types/ability-types/skills/Riding";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import ShieldBlock from "@shared/types/ability-types/skills/ShieldBlock";
import Spear from "@shared/types/ability-types/skills/Spear";
import Staff from "@shared/types/ability-types/skills/Staff";
import Sword from "@shared/types/ability-types/skills/Sword";
import ThirdAttack from "@shared/types/ability-types/skills/ThirdAttack";
import RomBasics from "@shared/types/ability-types/groups-class/RomBasics";
import ServerCache from "@shared/cache/server-cache";

export class AngelBasics implements IAbilityGroup {
  private static instance: AngelBasics;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    const abilityGroups = [
      ...RomBasics.GetInstance().abilities,
      BlindFighting.GetInstance(),
      Spear.GetInstance(),
      Parry.GetInstance(),
      Dodge.GetInstance(),
      Riding.GetInstance(),
      Rescue.GetInstance(),
      Flail.GetInstance(),
      Staff.GetInstance(),
      SecondAttack.GetInstance(),
      Meditation.GetInstance(),
      Sword.GetInstance(),
      ShieldBlock.GetInstance(),
      EnhancedDamage.GetInstance(),
      ThirdAttack.GetInstance(),
      FastHealing.GetInstance(),
    ];

    this.abilityGroup = AbilityGroup.AngelBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = abilityGroups;
  }

  // Method to get the single instance of the class
  public static GetInstance(): AngelBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AngelBasics.GetInstance() as T;
  }
}

export default AngelBasics;
