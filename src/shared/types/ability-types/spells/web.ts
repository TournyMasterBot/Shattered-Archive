import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Web implements IAbility {
  private static instance: Web;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `WEB

Syntax: cast 'web' <target>

This spell, available only to Invokers, entangles the target in a web that
prevents the victim from moving in any way. The target may be a mob or a
player.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Web.instance === undefined) {
      Web.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Web {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Web.GetInstance() as T;
  }
}

export default Web;
