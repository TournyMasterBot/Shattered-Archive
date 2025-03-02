import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Root implements IAbility {
  private static instance: Root;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ROOT

Syntax:  cast root <target>

Similar to entangle, the Eldritch calls upon the forest to root their
intended victim to the ground, leaving them little opportunity to flee.  

Groups containing this spell: ELDRITCH
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Root.instance === undefined) {
      Root.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Root {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Root.GetInstance() as T;
  }
}

export default Root;
