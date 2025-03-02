import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Waylay implements IAbility {
  private static instance: Waylay;

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
    this.helpFile = `
waylay
Bandits who are skilled with waylay can use its attack to initiate
combat and potentially gain more hits initially. It is used best when the
bandit is sneaking around.
`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Waylay {
    if (!Waylay.instance) {
      Waylay.instance = new Waylay();
    }
    return Waylay.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Waylay.GetInstance() as T;
  }
}

export default Waylay;
