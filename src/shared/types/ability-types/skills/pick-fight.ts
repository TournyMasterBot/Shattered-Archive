import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PickFight implements IAbility {
  private static instance: PickFight;

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
    this.helpFile = ``;

    this.manualDescription = `
Same as the charlatan skill, but you can make other people attack you by pouring a beer over their head and yelling "I THOUGHT THIS WAS ALGORON!!!"
`;

    if (PickFight.instance === undefined) {
      PickFight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PickFight {
    if (!PickFight.instance) {
      PickFight.instance = new PickFight();
    }
    return PickFight.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PickFight.GetInstance() as T;
  }
}

export default PickFight;
