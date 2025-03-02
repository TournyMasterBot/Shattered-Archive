import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Hunt implements IAbility {
  private static instance: Hunt;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help Hunt
HUNT
HUNT
By following tracks and sniffing the air, rangers using hunt can track other
players. They are able to determine in which direction the other person is.`;

    if (Hunt.instance === undefined) {
      Hunt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Hunt {
    if (!Hunt.instance) {
      Hunt.instance = new Hunt();
    }
    return Hunt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Hunt.GetInstance() as T;
  }
}

export default Hunt;
