import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SelfProjection implements IAbility {
  private static instance: SelfProjection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
SELF PROJECTION
SELF PROJECTION

Syntax: c 'self projection'

Self projection is a spell of the illusion spell group that puts a slightly
distorted image of yourself in front of you, at times causing an enemy to
miss you.  

Many different casters can cast this spell, though illusionists are said to
have better chances with it.  

See also - ILLUSION
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SelfProjection.instance === undefined) {
      SelfProjection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SelfProjection {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SelfProjection.GetInstance() as T;
  }
}

export default SelfProjection;
