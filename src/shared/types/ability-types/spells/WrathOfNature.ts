import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WrathOfNature implements IAbility {
  private static instance: WrathOfNature;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Wrath of Nature'
WRATH OF NATURE
Syntax:  cast 'wrath' <target>

As the druid or ranger continues to learn how to draw power from their
surroundings, the magic they produced grows stronger as a result. This
spell is one that strikes with the full force of the natural realm.

Groups containing this skill: ‘NATURE’ ‘DRUID DEFAULT’ ‘RANGER DEFAULT’`;

    this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
    this.abilityUsage = AbilityUsage.Active;

    if (WrathOfNature.instance === undefined) {
      WrathOfNature.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WrathOfNature {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WrathOfNature.GetInstance() as T;
  }
}

export default WrathOfNature;
