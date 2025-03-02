import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EnhancedReactions implements IAbility {
  private static instance: EnhancedReactions;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help 'enhanced reactions'
ENHANCED REACTIONS

Syntax: Passive

Owing to keen reflexes and innate ability, armsmen are often more 
proficient at dodging and parrying attacks due to their enhanced 
reactions.`;

    if (EnhancedReactions.instance === undefined) {
      EnhancedReactions.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnhancedReactions {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnhancedReactions.GetInstance() as T;
  }
}

export default EnhancedReactions;
