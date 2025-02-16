import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Escape implements IAbility {
  private static instance: Escape;

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
    this.name = "Escape";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `escape
Escaping is an art used by Nightshades inside of cities OR in dark rooms
to easily escape into any direction they choose.`;

    if (Escape.instance === undefined) {
      Escape.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Escape {
    if (!Escape.instance) {
      Escape.instance = new Escape();
    }
    return Escape.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Escape.GetInstance() as T;
  }
}

export default Escape;
