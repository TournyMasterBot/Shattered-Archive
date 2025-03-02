import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Lore from "@shared/types/ability-types/skills/Lore";
import Spellcraft from "@shared/types/ability-types/skills/Spellcraft";
import Alchemy from "@shared/types/ability-types/skills/Alchemy";
import DualWield from "@shared/types/ability-types/skills/DualWield";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import PickLock from "@shared/types/ability-types/skills/PickLock";
import Scribe from "@shared/types/ability-types/skills/Scribe";
import ServerCache from "@shared/cache/server-cache";

export class GiantExtras implements IAbilityGroup {
  static instance: GiantExtras;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.GiantExtras;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Lore.GetInstance(),
      Spellcraft.GetInstance(),
      Alchemy.GetInstance(),
      DualWield.GetInstance(),
      Astrology.GetInstance(),
      PickLock.GetInstance(),
      Scribe.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantExtras {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantExtras.GetInstance() as T;
  }
}

export default GiantExtras;
