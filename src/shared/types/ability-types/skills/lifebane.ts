import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Lifebane implements IAbility {
  private static instance: Lifebane;

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
    this.helpFile = `lifebane
Lifebane is a very strong poison used by Nightshades to envenom their
weapons. The lifebane poison is very lethal and long lasting.`;

    if (Lifebane.instance === undefined) {
      Lifebane.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Lifebane {
    if (!Lifebane.instance) {
      Lifebane.instance = new Lifebane();
    }
    return Lifebane.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Lifebane.GetInstance() as T;
  }
}

export default Lifebane;
