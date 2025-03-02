import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Misdirection implements IAbility {
  private static instance: Misdirection;

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
    this.helpFile = `misdirection
Misdirection allows the Nightshade to flee while making their opponent
think that they fled into a different direction.`;

    if (Misdirection.instance === undefined) {
      Misdirection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Misdirection {
    if (!Misdirection.instance) {
      Misdirection.instance = new Misdirection();
    }
    return Misdirection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Misdirection.GetInstance() as T;
  }
}

export default Misdirection;
