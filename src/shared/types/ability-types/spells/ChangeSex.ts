import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ChangeSex implements IAbility {
  private static instance: ChangeSex;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `'CHANGE SEX'
Syntax: cast 'change sex' <victim>
This spell changes the sex of the victim (temporarily).`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ChangeSex.instance === undefined) {
      ChangeSex.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ChangeSex {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ChangeSex.GetInstance() as T;
  }
}

export default ChangeSex;
