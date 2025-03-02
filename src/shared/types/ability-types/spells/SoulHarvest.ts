import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SoulHarvest implements IAbility {
  private static instance: SoulHarvest;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `soul harvest
It's been told that a powerful Necromancer can take the heart harvested from
the corpse of an individual and transfer its powers into that of another
individual. The necromancer must be holding the harvested heart while
casting the spell.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SoulHarvest.instance === undefined) {
      SoulHarvest.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SoulHarvest {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SoulHarvest.GetInstance() as T;
  }
}

export default SoulHarvest;
