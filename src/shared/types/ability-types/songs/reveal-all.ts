import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class RevealAll implements IAbility {
  private static instance: RevealAll;

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
Reveal All - As they are sung, the high pitched notes of this song will 
force any that hear its tune to twitch, causing any that are hidden nearby 
to reveal themselves.
`;
    this.manualDescription = "* Similar to faerie fog, but no fail, and -everyone- twitches";

    if (RevealAll.instance === undefined) {
      RevealAll.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RevealAll {
    if (!RevealAll.instance) {
      RevealAll.instance = new RevealAll();
    }
    return RevealAll.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RevealAll.GetInstance() as T;
  }
}

export default RevealAll;
