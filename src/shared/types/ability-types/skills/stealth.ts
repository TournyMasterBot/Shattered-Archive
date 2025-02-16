import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Stealth implements IAbility {
  private static instance: Stealth;

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
    this.name = "Stealth";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
stealth
The bandit has the unique ability to quickly sneak and hide at the same time.
`;

    if (Stealth.instance === undefined) {
      Stealth.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Stealth {
    if (!Stealth.instance) {
      Stealth.instance = new Stealth();
    }
    return Stealth.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Stealth.GetInstance() as T;
  }
}

export default Stealth;
