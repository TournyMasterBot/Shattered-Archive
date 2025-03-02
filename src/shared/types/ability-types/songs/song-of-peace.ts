import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SongOfPeace implements IAbility {
  private static instance: SongOfPeace;

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
Song of Peace - A very powerful and useful song, this allows bards 
to cease all combat in a room regardless of who is fighting who. 
`;

    if (SongOfPeace.instance === undefined) {
      SongOfPeace.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SongOfPeace {
    if (!SongOfPeace.instance) {
      SongOfPeace.instance = new SongOfPeace();
    }
    return SongOfPeace.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SongOfPeace.GetInstance() as T;
  }
}

export default SongOfPeace;
