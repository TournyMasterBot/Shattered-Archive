import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ChantOfAccuracy implements IAbility {
  private static instance: ChantOfAccuracy;

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
    this.name = "Chant of Accuracy";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
This chant increases the hit roll of everyone in 
the skald's group as long as they are also in the same room as the skald.
`;
    this.manualDescription = "This song is a chant that gives +hit, which reduces the chance to 'miss' on attacks";

    if (ChantOfAccuracy.instance === undefined) {
      ChantOfAccuracy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ChantOfAccuracy {
    if (!ChantOfAccuracy.instance) {
      ChantOfAccuracy.instance = new ChantOfAccuracy();
    }
    return ChantOfAccuracy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ChantOfAccuracy.GetInstance() as T;
  }
}

export default ChantOfAccuracy;
