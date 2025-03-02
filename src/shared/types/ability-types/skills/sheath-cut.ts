import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SheathCut implements IAbility {
  private static instance: SheathCut;

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
    this.helpFile = `sheath cut
A nightshade may disarm the sheathed weapon using this command.`;
    this.manualDescription = ``;

    if (SheathCut.instance === undefined) {
      SheathCut.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SheathCut {
    if (!SheathCut.instance) {
      SheathCut.instance = new SheathCut();
    }
    return SheathCut.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SheathCut.GetInstance() as T;
  }
}

export default SheathCut;
