import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FeignDeath implements IAbility {
  private static instance: FeignDeath;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
'FEIGN DEATH'

Syntax: cast 'feign death'

This spell gives the caster the look of his own corpse. When remaining
still, the Necromancer appears to be his own corpse.

This spell has no specific use; it is a beginner's spell, which aspiring
Necromancers use to hone their skill in the Art.

See also - NECROMANCY NECROMANCER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FeignDeath.instance === undefined) {
      FeignDeath.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FeignDeath {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FeignDeath.GetInstance() as T;
  }
}

export default FeignDeath;
