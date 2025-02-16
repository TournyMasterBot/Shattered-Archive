import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class RoostersCrow implements IAbility {
  private static instance: RoostersCrow;

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
    this.name = "The Roosters Crow";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
The Rooster's Crow - The tune of this song resembles that of the
rooster's crow marking the sunrise, enabling the bard to wake up anyone in
sleep spell.
`;
    this.manualDescription =
      "* Wake all sleeping in room, including sleep/strangle";

    if (RoostersCrow.instance === undefined) {
      RoostersCrow.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RoostersCrow {
    if (!RoostersCrow.instance) {
      RoostersCrow.instance = new RoostersCrow();
    }
    return RoostersCrow.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RoostersCrow.GetInstance() as T;
  }
}

export default RoostersCrow;
