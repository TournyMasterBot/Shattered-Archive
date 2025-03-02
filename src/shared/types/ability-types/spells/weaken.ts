import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Weaken implements IAbility {
  private static instance: Weaken;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help Weaken
WEAKEN
WEAKEN
Syntax: cast weaken <victim>
The weaken spell reduces the physical power of the caster's target by
reducing his strength. The amount of the strength reduced by a caster
depends on the level of the caster.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Weaken.instance === undefined) {
      Weaken.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Weaken {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Weaken.GetInstance() as T;
  }
}

export default Weaken;
