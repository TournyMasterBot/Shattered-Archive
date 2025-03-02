import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HealingDream implements IAbility {
  private static instance: HealingDream;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
HEALING DREAM

Being a master of the mind, mentalists are able to cast a spell upon a
sleeping individual that will allow them to heal much faster while sleeping
so they may resume their tasks much more quickly.

This spell may only be cast on someone who is sleeping. Casting upon
someone who is not asleep may result in some strange brain tingling.

Syntax : cast 'healing dream' target
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (HealingDream.instance === undefined) {
      HealingDream.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HealingDream {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HealingDream.GetInstance() as T;
  }
}

export default HealingDream;
