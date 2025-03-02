import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnduringWrath implements IAbility {
  private static instance: EnduringWrath;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Enduring Wrath'
'ENDURING WRATH'
Syntax: cast 'enduring wrath'

Description of the spell goes here.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnduringWrath.instance === undefined) {
      EnduringWrath.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnduringWrath {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnduringWrath.GetInstance() as T;
  }
}

export default EnduringWrath;
