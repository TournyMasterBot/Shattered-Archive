import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ApplyPotion implements IAbility {
  private static instance: ApplyPotion;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `apply potion
Syntax: Apply <potion> item
A warlock may choose to attempt to apply a gourd potion to an item
he holds, possibly infusing it with magic. Of course, cracking a
potion over an item like an egg is a messy process, and the witch or
warlock is likely to be affected by the brew as well, from spillage.`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (ApplyPotion.instance === undefined) {
      ApplyPotion.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ApplyPotion {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ApplyPotion.GetInstance() as T;
  }
}

export default ApplyPotion;
