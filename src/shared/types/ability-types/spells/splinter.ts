import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Splinter implements IAbility {
  private static instance: Splinter;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SPLINTER
SPLINTER

Syntax: cast 'splinter' <item>

This witchcraft spell focuses the will of the caster into any object of
wood, splintering it into fragments which may be of use to the caster.

See also - WITCHCRAFT`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Splinter.instance === undefined) {
      Splinter.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Splinter {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Splinter.GetInstance() as T;
  }
}

export default Splinter;
