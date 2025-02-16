import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class GourdOfHealth implements IAbility {
  private static instance: GourdOfHealth;

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
    this.name = "Gourd of Health";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `Sipping on a gourd to recover some health.`;

    if (GourdOfHealth.instance === undefined) {
      GourdOfHealth.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): GourdOfHealth {
    if (!GourdOfHealth.instance) {
      GourdOfHealth.instance = new GourdOfHealth();
    }
    return GourdOfHealth.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GourdOfHealth.GetInstance() as T;
  }
}

export default GourdOfHealth;
