import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Lore from "@shared/types/ability-types/skills/lore";
import Spellcraft from "@shared/types/ability-types/skills/spellcraft";
import Alchemy from "@shared/types/ability-types/skills/alchemy";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import Astrology from "@shared/types/ability-types/skills/astrology";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Scribe from "@shared/types/ability-types/skills/scribe";

export class GiantExtras implements IAbilityGroup {
  static instance: GiantExtras;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.GiantExtras;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Lore.GetInstance().Get(),
      Spellcraft.GetInstance().Get(),
      Alchemy.GetInstance().Get(),
      DualWield.GetInstance().Get(),
      Astrology.GetInstance().Get(),
      PickLock.GetInstance().Get(),
      Scribe.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantExtras {
    if (!GiantExtras.instance) {
      GiantExtras.instance = new GiantExtras();
    }
    return GiantExtras.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantExtras.GetInstance() as T;
  }
}

export default GiantExtras;
