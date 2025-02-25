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
import ServerCache from "@shared/cache/server-cache";

export class BalanxBasics implements IAbilityGroup {
  static instance: BalanxBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BalanxBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      ...RomBasics.GetInstance().abilities,
       Parry.GetInstance(),
       Riding.GetInstance(),
       Mountaineering.GetInstance(),
       Disarm.GetInstance(),
       Spellcraft.GetInstance(),
       Herbal.GetInstance(),
       BlindFighting.GetInstance(),
       Dodge.GetInstance(),
       Climbing.GetInstance(),
       Meditation.GetInstance(),
       Astrology.GetInstance(),
       Lore.GetInstance(),
       EnhancedDamage.GetInstance(),
       FastHealing.GetInstance(),
       Kick.GetInstance(),
       RemoveTrap.GetInstance(),
       Alchemy.GetInstance(),
       Peek.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BalanxBasics {
    if (!BalanxBasics.instance) {
      BalanxBasics.instance = new BalanxBasics();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return BalanxBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BalanxBasics.GetInstance() as T;
  }
}

export default BalanxBasics;
