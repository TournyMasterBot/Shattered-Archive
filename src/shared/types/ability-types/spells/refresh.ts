import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Refresh implements IAbility {
  private static instance: Refresh;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Refresh'
REFRESH
REFRESH

Syntax: cast refresh <character>

This spell refreshes the movement points of a character who is out of
movement points.  

See also - ENHANCEMENT
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Refresh.instance === undefined) {
      Refresh.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Refresh {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Refresh.GetInstance() as T;
  }
}

export default Refresh;
