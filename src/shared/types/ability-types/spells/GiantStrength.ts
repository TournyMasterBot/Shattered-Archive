import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class GiantStrength implements IAbility {
  private static instance: GiantStrength;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Giant Strength'
'GIANT STRENGTH'
'GIANT STRENGTH'

Syntax: cast 'giant strength' <character>

The caster can enhance the physical strength of a target, either himself or
another, with this spell, giving the recipient the strength of a mighty
giant.  

See also - ENHANCEMENT 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (GiantStrength.instance === undefined) {
      GiantStrength.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantStrength {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantStrength.GetInstance() as T;
  }
}

export default GiantStrength;
