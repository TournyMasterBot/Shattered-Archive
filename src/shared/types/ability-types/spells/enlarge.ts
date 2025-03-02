import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Enlarge implements IAbility {
  private static instance: Enlarge;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ENLARGE REDUCE

Syntax:  cast 'enlarge'
         cast 'reduce'

These spells enlarge or reduce the size of the caster.

See also - ALTERATION TRANSMUTER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Enlarge.instance === undefined) {
      Enlarge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Enlarge {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Enlarge.GetInstance() as T;
  }
}

export default Enlarge;
