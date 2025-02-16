import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SongOfHealing implements IAbility {
  private static instance: SongOfHealing;

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
    this.name = "Song of Healing";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Song of Healing - The soft melody of this song allows the Skald to mend 
all their groupmates' wounds and helps them to prepare for battle once more.
`;

    if (SongOfHealing.instance === undefined) {
      SongOfHealing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SongOfHealing {
    if (!SongOfHealing.instance) {
      SongOfHealing.instance = new SongOfHealing();
    }
    return SongOfHealing.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SongOfHealing.GetInstance() as T;
  }
}

export default SongOfHealing;
