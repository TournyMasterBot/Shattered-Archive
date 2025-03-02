import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ForceField implements IAbility {
  private static instance: ForceField;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help wujen
Force Field - Utilizing their mastery over metal, the Wu Jen creates a field
that neutralizes melee attacks for a brief time, warding away blows
temporarily.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ForceField.instance === undefined) {
      ForceField.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ForceField {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ForceField.GetInstance() as T;
  }
}

export default ForceField;
