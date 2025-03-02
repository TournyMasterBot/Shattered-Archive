import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Earthquake implements IAbility {
  private static instance: Earthquake;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Earthquake'
'EARTHQUAKE'
'EARTHQUAKE'

Syntax: cast 'earthquake'

This spell inflicts damage on every enemy character in the room. Beware
that other characters who are not yet fighting may attack you as a result! 

See also - ATTACK
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Earthquake.instance === undefined) {
      Earthquake.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Earthquake {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Earthquake.GetInstance() as T;
  }
}

export default Earthquake;
