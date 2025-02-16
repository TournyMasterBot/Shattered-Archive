import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Tumbling implements IAbility {
  private static instance: Tumbling;

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
    this.name = "Tumbling";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `
TUMBLING

Quick reactions, high dexterity and a steadiness on ones feet are all 
traits of the successful jongleur.  As such, when they finds themselves 
being bashed by their enemies, they knows well enough to duck and roll into 
it so as to jump straight back on their feet, with no loss in momentum or 
thought.  This is a passive skill.

Groups containing this skill: JONGLEUR DEFAULT
`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Tumbling {
    if (!Tumbling.instance) {
      Tumbling.instance = new Tumbling();
    }
    return Tumbling.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Tumbling.GetInstance() as T;
  }
}

export default Tumbling;
