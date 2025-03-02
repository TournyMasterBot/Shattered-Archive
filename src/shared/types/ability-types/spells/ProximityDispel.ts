import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ProximityDispel implements IAbility {
  private static instance: ProximityDispel;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Proximity Dispel'
proximity dispel
Syntax: cast 'proximity dispel'

Proximity dispel is a protection spell used to attempt to remove magics that
are cast on an area instead of a person.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ProximityDispel.instance === undefined) {
      ProximityDispel.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ProximityDispel {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ProximityDispel.GetInstance() as T;
  }
}

export default ProximityDispel;
