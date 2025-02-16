import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class MelodyOfMeditation implements IAbility {
  private static instance: MelodyOfMeditation;

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
    this.name = "Melody of Meditation";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Melody of Meditation - The constant chant of this tune allows the 
Skald and their party to continually regain substantial portions of their 
magical strength over time.
`;
    this.manualDescription = "This song is a chant";

    if (MelodyOfMeditation.instance === undefined) {
      MelodyOfMeditation.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MelodyOfMeditation {
    if (!MelodyOfMeditation.instance) {
      MelodyOfMeditation.instance = new MelodyOfMeditation();
    }
    return MelodyOfMeditation.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MelodyOfMeditation.GetInstance() as T;
  }
}

export default MelodyOfMeditation;
