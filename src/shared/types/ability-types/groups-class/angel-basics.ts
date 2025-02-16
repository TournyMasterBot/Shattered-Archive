import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import Dodge from "@shared/types/ability-types/skills/dodge";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Flail from "@shared/types/ability-types/skills/flail";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Parry from "@shared/types/ability-types/skills/parry";
import Rescue from "@shared/types/ability-types/skills/rescue";
import Riding from "@shared/types/ability-types/skills/riding";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Spear from "@shared/types/ability-types/skills/spear";
import Staff from "@shared/types/ability-types/skills/staff";
import Sword from "@shared/types/ability-types/skills/sword";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import RomBasics from "@shared/types/ability-types/groups-class/rom-basics";

export class AngelBasics implements IAbilityGroup {
  private static instance: AngelBasics;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    const abilityGroups = [
      ...RomBasics.GetInstance().Get<RomBasics>().abilities,
      new BlindFighting(),
      new Spear(),
      new Parry(),
      new Dodge(),
      new Riding(),
      new Rescue(),
      new Flail(),
      new Staff(),
      new SecondAttack(),
      new Meditation(),
      new Sword(),
      new ShieldBlock(),
      new EnhancedDamage(),
      new ThirdAttack(),
      new FastHealing(),
    ];

    this.abilityGroup = AbilityGroup.AngelBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = abilityGroups;
  }

  // Method to get the single instance of the class
  public static GetInstance(): AngelBasics {
    if (!AngelBasics.instance) {
      AngelBasics.instance = new AngelBasics();
    }
    return AngelBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AngelBasics.GetInstance() as T;
  }
}

export default AngelBasics;
