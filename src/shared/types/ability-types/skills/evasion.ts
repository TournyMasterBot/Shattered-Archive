import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Evasion implements IAbility {
  private static instance: Evasion;

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
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `evasion
Lightning quick reflexes and supreme situational awareness allow the
swashbuckler a heightened degree of control within a fight. Able to use his
environment to his advantage as well as his superior skills he is able to
maneuver himself to perform a tactical retreat in the direction of his
choice with a higher chance of success than most of his opponents.`;

    if (Evasion.instance === undefined) {
      Evasion.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Evasion {
    if (!Evasion.instance) {
      Evasion.instance = new Evasion();
    }
    return Evasion.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Evasion.GetInstance() as T;
  }
}

export default Evasion;
