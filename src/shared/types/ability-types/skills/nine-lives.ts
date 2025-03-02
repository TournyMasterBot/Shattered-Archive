import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class NineLives implements IAbility {
  private static instance: NineLives;

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
    this.helpFile = ``;
    this.manualDescription = "When you die, come back again! Nine times. Does not replenish unless you retrain / reclass.";

    if (NineLives.instance === undefined) {
      NineLives.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): NineLives {
    if (!NineLives.instance) {
      NineLives.instance = new NineLives();
    }
    return NineLives.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NineLives.GetInstance() as T;
  }
}

export default NineLives;
