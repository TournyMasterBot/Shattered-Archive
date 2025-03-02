import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Disenchant implements IAbility {
  private static instance: Disenchant;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DISENCHANT

Syntax: cast 'disenchant' <item>

A disenchantment allows the enchantor to fade any magical effects that have
been placed on the weapon or armor. It has been rumoured that this effect
is similar to the effects of enchantment fading.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Disenchant.instance === undefined) {
      Disenchant.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Disenchant {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Disenchant.GetInstance() as T;
  }
}

export default Disenchant;
