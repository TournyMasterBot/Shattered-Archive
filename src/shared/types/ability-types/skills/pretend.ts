import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Pretend implements IAbility {
  private static instance: Pretend;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
PRETEND

Pretend will allow a charlatan to assume the role of a base class and use
specific skills and abilities of the given class. Valid classes are Thief,
Warrior, Mage, and Cleric.  

Syntax: pretend <class>
        `;

    if (Pretend.instance === undefined) {
      Pretend.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Pretend {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Pretend.GetInstance() as T;
  }
}

export default Pretend;
