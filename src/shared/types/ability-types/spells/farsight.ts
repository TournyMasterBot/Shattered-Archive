import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Farsight implements IAbility {
  private static instance: Farsight;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Farsight'
FARSIGHT Syntax: cast 'farsight'

Farsight allows a caster to see the presence of other mortals within the
surrounding area's of the one that individual is in.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Farsight.instance === undefined) {
      Farsight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Farsight {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Farsight.GetInstance() as T;
  }
}

export default Farsight;
