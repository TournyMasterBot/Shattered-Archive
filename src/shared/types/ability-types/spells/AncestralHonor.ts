import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AncestralHonor implements IAbility {
  private static instance: AncestralHonor;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
HELP 'ANCESTRAL HONOR'

Syntax: cast 'ancestral honor' <character>

The shukenja calls upon their ancestral spirits for extra protection. They
may share this protection with their allies to bolster their armor.

Groups containing this skill: SHUKENJA
`;

    if (AncestralHonor.instance === undefined) {
      AncestralHonor.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AncestralHonor {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AncestralHonor.GetInstance() as T;
  }
}

export default AncestralHonor;
