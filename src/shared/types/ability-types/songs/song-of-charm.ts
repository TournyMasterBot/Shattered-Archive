import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SongOfCharm implements IAbility {
  private static instance: SongOfCharm;

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
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Song of Charm - An enchanting tune that can be sung to allow the bard 
to potentially place their target temporarily under his or her control.
`;

    if (SongOfCharm.instance === undefined) {
      SongOfCharm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SongOfCharm {
    if (!SongOfCharm.instance) {
      SongOfCharm.instance = new SongOfCharm();
    }
    return SongOfCharm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SongOfCharm.GetInstance() as T;
  }
}

export default SongOfCharm;
