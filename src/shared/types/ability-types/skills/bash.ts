import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Bash implements IAbility {
  private static instance: Bash;

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
    this.name = "Bash";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help bash
BASH
The bash skill is a warrior talent, a brute-force attack designed to knock
your foe to his knees.  Its success depends on many factors, including the
bash rating, your weight, and the size of your opponent.  Bashing a dragon
is generally not a wise idea.`;

    if (Bash.instance === undefined) {
      Bash.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Bash {
    if (!Bash.instance) {
      Bash.instance = new Bash();
    }
    return Bash.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Bash.GetInstance() as T;
  }
}

export default Bash;
