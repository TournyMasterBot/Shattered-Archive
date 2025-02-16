import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Riding from "@shared/types/ability-types/skills/riding";
import Mountaineering from "@shared/types/ability-types/skills/mountaineering";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Spellcraft from "@shared/types/ability-types/skills/spellcraft";
import Herbal from "@shared/types/ability-types/skills/herbal";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Climbing from "@shared/types/ability-types/skills/climbing";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Lore from "@shared/types/ability-types/skills/lore";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Kick from "@shared/types/ability-types/skills/kick";
import RemoveTrap from "@shared/types/ability-types/skills/remove-trap";
import Alchemy from "@shared/types/ability-types/skills/alchemy";
import Peek from "@shared/types/ability-types/skills/peek";
import RomBasics from "./rom-basics";

export class BalanxBasics implements IAbilityGroup {
  static instance: BalanxBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.BalanxBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      ...RomBasics.GetInstance().Get<RomBasics>().abilities,
      new Parry(),
      new Riding(),
      new Mountaineering(),
      new Disarm(),
      new Spellcraft(),
      new Herbal(),
      new BlindFighting(),
      new Dodge(),
      new Climbing(),
      new Meditation(),
      new Astrology(),
      new Lore(),
      new EnhancedDamage(),
      new FastHealing(),
      new Kick(),
      new RemoveTrap(),
      new Alchemy(),
      new Peek(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BalanxBasics {
    if (!BalanxBasics.instance) {
      BalanxBasics.instance = new BalanxBasics();
    }
    return BalanxBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BalanxBasics.GetInstance() as T;
  }
}

export default BalanxBasics;
