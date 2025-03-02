import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Backstab implements IAbility {
  private static instance: Backstab;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help backstab
BACKSTAB
Backstab is the favored attack of thieves, murderers, and other rogues. It
can be used with any weapon type, but is most effective with piercing weapons.
The damage inflicted by a backstab is determined by the attacker's level, his
weapon skill, his backstab skill, and the power of his opponent.
Only thieves may learn the backstab.
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Backstab.instance === undefined) {
      Backstab.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Backstab {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Backstab.GetInstance() as T;
  }
}

export default Backstab;
