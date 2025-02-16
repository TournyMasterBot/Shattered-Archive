import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ReleaseMe implements IAbility {
  private static instance: ReleaseMe;

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
    this.name = "Release Me";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Release Me - An interesting bard song that can distract the target 
enough so that as they listen to the tune, they may actually drop their 
weapon upon the ground.
`;

    if (ReleaseMe.instance === undefined) {
      ReleaseMe.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ReleaseMe {
    if (!ReleaseMe.instance) {
      ReleaseMe.instance = new ReleaseMe();
    }
    return ReleaseMe.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ReleaseMe.GetInstance() as T;
  }
}

export default ReleaseMe;
