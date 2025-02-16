import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class KegToss implements IAbility {
  private static instance: KegToss;

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
    this.name = "Keg Toss";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;
    this.manualDescription = `Raise that keg up and crash someone's skull with it!!`;

    if (KegToss.instance === undefined) {
      KegToss.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): KegToss {
    if (!KegToss.instance) {
      KegToss.instance = new KegToss();
    }
    return KegToss.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return KegToss.GetInstance() as T;
  }
}

export default KegToss;
