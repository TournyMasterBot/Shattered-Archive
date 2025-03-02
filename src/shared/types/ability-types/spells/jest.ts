import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Jest implements IAbility {
  private static instance: Jest;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `JEST

Syntax: cast 'jest' <victim>

When jested by an enchantor the victim becomes so captivated with the
caster's presence that they cannot think for themselves or carry out any
other actions.  

Groups containing this spell: Enhanced Enchantment

SEE ALSO:  ENCHANTOR, ENHANCED ENCHANTMENT`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Jest.instance === undefined) {
      Jest.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Jest {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Jest.GetInstance() as T;
  }
}

export default Jest;
