import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class TravelTune implements IAbility {
  private static instance: TravelTune;

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
    this.name = "Travel Tune";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Travel Tune - By singing this upbeat and catchy tune, the Skald will 
motivate their group to get their second wind and refresh them in order to 
continue on their journey.
`;

    if (TravelTune.instance === undefined) {
      TravelTune.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): TravelTune {
    if (!TravelTune.instance) {
      TravelTune.instance = new TravelTune();
    }
    return TravelTune.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return TravelTune.GetInstance() as T;
  }
}

export default TravelTune;
